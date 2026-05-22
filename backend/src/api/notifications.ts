import { Router, type Request, type Response } from "express";
import { requireAuth } from "./auth.js";
import {
  getNotificationsForMember,
  getUnreadCount,
  markRead,
  markAllRead,
  deleteNotification,
} from "../services/notificationCrud.js";

export const notificationsRouter = Router();

notificationsRouter.use(requireAuth);

// ── GET /api/notifications ───────────────────────────────────
notificationsRouter.get("/", async (req: Request, res: Response) => {
  try {
    const memberId   = (req.session as any).memberId as string;
    const limit      = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const cursor     = req.query.cursor as string | undefined;
    const unreadOnly = req.query.unreadOnly === "true";

    const result = await getNotificationsForMember(memberId, { limit, cursor, unreadOnly });
    res.json(result);
  } catch (err) {
    console.error("GET /notifications error:", err);
    res.status(500).json({ error: "Failed to fetch notifications" });
  }
});

// ── GET /api/notifications/unread-count ──────────────────────
notificationsRouter.get("/unread-count", async (req: Request, res: Response) => {
  try {
    const memberId = (req.session as any).memberId as string;
    const count    = await getUnreadCount(memberId);
    res.json({ count });
  } catch (err) {
    console.error("GET /notifications/unread-count error:", err);
    res.status(500).json({ error: "Failed to fetch unread count" });
  }
});

// ── PATCH /api/notifications/:id/read ───────────────────────
notificationsRouter.patch("/:id/read", async (req: Request, res: Response) => {
  try {
    const memberId = (req.session as any).memberId as string;
    await markRead(req.params.id as string, memberId);
    res.json({ ok: true });
  } catch (err: any) {
    if (err?.status === 404) { res.status(404).json({ error: "Notification not found" }); return; }
    console.error("PATCH /notifications/:id/read error:", err);
    res.status(500).json({ error: "Failed to mark notification as read" });
  }
});

// ── POST /api/notifications/read-all ────────────────────────
notificationsRouter.post("/read-all", async (req: Request, res: Response) => {
  try {
    const memberId = (req.session as any).memberId as string;
    await markAllRead(memberId);
    res.json({ ok: true });
  } catch (err) {
    console.error("POST /notifications/read-all error:", err);
    res.status(500).json({ error: "Failed to mark all read" });
  }
});

// ── DELETE /api/notifications/:id ───────────────────────────
notificationsRouter.delete("/:id", async (req: Request, res: Response) => {
  try {
    const memberId = (req.session as any).memberId as string;
    await deleteNotification(req.params.id as string, memberId);
    res.json({ ok: true });
  } catch (err: any) {
    if (err?.status === 404) { res.status(404).json({ error: "Notification not found" }); return; }
    console.error("DELETE /notifications/:id error:", err);
    res.status(500).json({ error: "Failed to delete notification" });
  }
});
