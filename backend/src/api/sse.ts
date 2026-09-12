import { Router, type Request, type Response, type NextFunction } from "express";
import { requireAuth, verifyBearerToken } from "./auth.js";
import { activityBus } from "../services/activityService.js";
import { prisma } from "../db/prisma.js";

export const sseRouter = Router();

// EventSource cannot set an Authorization header, so Bearer-token users
// (cookie-blocked browsers, e.g. Brave) authenticate the stream via a signed
// `?token=` query param. sseRouter MUST be mounted in app.ts BEFORE
// notificationsRouter and every bare app.use("/api", …) router — see
// src/appMountOrder.test.ts.
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
sseRouter.get("/stream", streamAuth, (req: Request, res: Response) => {
  const memberId = req.memberId;
  if (!memberId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // disable Nginx buffering
  res.flushHeaders();
  res.write("event: connected\ndata: {}\n\n");

  const send = (event: string, data: unknown) => {
    try {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    } catch {
      // client disconnected mid-write — handled by the close handler below
    }
  };

  // ── Notifications ─────────────────────────────────────────
  const onNotification = (n: unknown) => send("notification", n);
  const onNotificationRead = (p: unknown) => send("notification-read", p);
  const onNotificationRemoved = (p: unknown) => send("notification-removed", p);
  activityBus.on(`notification:${memberId}`, onNotification);
  activityBus.on(`notification-read:${memberId}`, onNotificationRead);
  activityBus.on(`notification-removed:${memberId}`, onNotificationRemoved);

  // ── Slack conversations ───────────────────────────────────
  // ONE listener on the global topic, filtered per event. Public-channel events
  // go to everyone (any member may read a public channel); private channels,
  // DMs and group DMs only to their participants. Until the member's
  // conversation set has loaded, non-public events are dropped — fail closed.
  const mine = new Set<string>();
  let membershipTopic: string | null = null;
  let closed = false;

  const onChat = (e: { channelId: string; convKind: string }) => {
    if (e.convKind !== "CHANNEL" && !mine.has(e.channelId)) return;
    send("slack-message", e);
  };
  const onMembership = (p: { channelId: string; joined: boolean }) => {
    if (p.joined) mine.add(p.channelId);
    else mine.delete(p.channelId);
    send("slack-membership", p);
  };
  activityBus.on("slack-chat", onChat);

  void (async () => {
    try {
      const me = await prisma.member.findUnique({ where: { id: memberId }, select: { slackId: true } });
      if (!me || closed) return;
      const rows = await prisma.slackConversationMember.findMany({
        where: { slackUserId: me.slackId },
        select: { slackChannelId: true },
      });
      if (closed) return;
      for (const r of rows) mine.add(r.slackChannelId);
      membershipTopic = `slack-membership:${me.slackId}`;
      activityBus.on(membershipTopic, onMembership);
    } catch (err) {
      console.error("[sse] failed to load conversation membership:", err);
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

  req.on("close", () => {
    closed = true;
    clearInterval(heartbeat);
    activityBus.off(`notification:${memberId}`, onNotification);
    activityBus.off(`notification-read:${memberId}`, onNotificationRead);
    activityBus.off(`notification-removed:${memberId}`, onNotificationRemoved);
    activityBus.off("slack-chat", onChat);
    if (membershipTopic) activityBus.off(membershipTopic, onMembership);
    res.end();
  });
});
