import { Router } from "express";
import { requireAuth } from "./auth.js";
import { getNotificationsForMember, getUnreadCount, markRead, markAllRead, deleteNotification, } from "../services/notificationCrud.js";
export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);
// ── GET /api/notifications ───────────────────────────────────
notificationsRouter.get("/", async (req, res) => {
    try {
        const memberId = req.session.memberId;
        const limit = Math.min(parseInt(req.query.limit) || 20, 100);
        const cursor = req.query.cursor;
        const unreadOnly = req.query.unreadOnly === "true";
        const result = await getNotificationsForMember(memberId, { limit, cursor, unreadOnly });
        res.json(result);
    }
    catch (err) {
        console.error("GET /notifications error:", err);
        res.status(500).json({ error: "Failed to fetch notifications" });
    }
});
// ── GET /api/notifications/unread-count ──────────────────────
notificationsRouter.get("/unread-count", async (req, res) => {
    try {
        const memberId = req.session.memberId;
        const count = await getUnreadCount(memberId);
        res.json({ count });
    }
    catch (err) {
        console.error("GET /notifications/unread-count error:", err);
        res.status(500).json({ error: "Failed to fetch unread count" });
    }
});
// ── PATCH /api/notifications/:id/read ───────────────────────
notificationsRouter.patch("/:id/read", async (req, res) => {
    try {
        const memberId = req.session.memberId;
        await markRead(req.params.id, memberId);
        res.json({ ok: true });
    }
    catch (err) {
        if (err?.status === 404) {
            res.status(404).json({ error: "Notification not found" });
            return;
        }
        console.error("PATCH /notifications/:id/read error:", err);
        res.status(500).json({ error: "Failed to mark notification as read" });
    }
});
// ── POST /api/notifications/read-all ────────────────────────
notificationsRouter.post("/read-all", async (req, res) => {
    try {
        const memberId = req.session.memberId;
        await markAllRead(memberId);
        res.json({ ok: true });
    }
    catch (err) {
        console.error("POST /notifications/read-all error:", err);
        res.status(500).json({ error: "Failed to mark all read" });
    }
});
// ── DELETE /api/notifications/:id ───────────────────────────
notificationsRouter.delete("/:id", async (req, res) => {
    try {
        const memberId = req.session.memberId;
        await deleteNotification(req.params.id, memberId);
        res.json({ ok: true });
    }
    catch (err) {
        if (err?.status === 404) {
            res.status(404).json({ error: "Notification not found" });
            return;
        }
        console.error("DELETE /notifications/:id error:", err);
        res.status(500).json({ error: "Failed to delete notification" });
    }
});
//# sourceMappingURL=notifications.js.map