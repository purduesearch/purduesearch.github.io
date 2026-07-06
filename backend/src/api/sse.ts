import { Router, type Request, type Response, type NextFunction } from "express";
import { requireAuth, verifyBearerToken } from "./auth.js";
import { activityBus } from "../services/activityService.js";

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
// mounted BEFORE notificationsRouter in app.ts — notificationsRouter attaches
// its own pathless requireAuth, which would 401 a valid ?token= EventSource
// (no cookie, no header) before it ever reached this handler.
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
    res.end();
  });
});
