import { Router } from "express";
import { requireAuth } from "./auth.js";
import { activityBus } from "../services/activityService.js";
export const sseRouter = Router();
sseRouter.use(requireAuth);
// ── GET /api/notifications/stream ───────────────────────────
// SSE stream: sends new notification events in real time to the authenticated member.
sseRouter.get("/stream", (req, res) => {
    const memberId = req.session.memberId;
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // disable Nginx buffering
    res.flushHeaders();
    // Send an initial ping so the client knows the connection is live
    res.write("event: connected\ndata: {}\n\n");
    // Push new notifications as they are created
    const onNotification = (notif) => {
        try {
            res.write(`event: notification\ndata: ${JSON.stringify(notif)}\n\n`);
        }
        catch {
            // client disconnected mid-write — handled by the close handler below
        }
    };
    activityBus.on(`notification:${memberId}`, onNotification);
    // Heartbeat every 30s to keep the connection alive through proxies
    const heartbeat = setInterval(() => {
        try {
            res.write(": heartbeat\n\n");
        }
        catch {
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
//# sourceMappingURL=sse.js.map