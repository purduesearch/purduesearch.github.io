import { Router, type Request, type Response } from "express";
import { requireAuth } from "./auth.js";
import { prisma } from "../db/prisma.js";
import {
  fetchIcs, parseIcs, IcsFeedError, ICS_ERROR_MESSAGE, assertSafeFeedUrl, checkRateLimit,
} from "../services/icsFeedService.js";

export const eventImportRouter = Router();
eventImportRouter.use(requireAuth);

const EVENT_TYPES = new Set(["MEETING", "DEADLINE", "WORKSHOP", "SOCIAL", "OTHER"]);

async function requireAdminMember(req: Request, res: Response): Promise<boolean> {
  const member = await prisma.member.findUnique({
    where: { id: req.memberId },
    select: { isAdmin: true },
  });
  if (!member?.isAdmin) {
    res.status(403).json({ error: "Forbidden" });
    return false;
  }
  return true;
}

// ── POST /api/events/import/preview ──────────────────────────
//
// Parses a feed and reports what it holds. Nothing is written. Events already
// imported (matched by ICS UID) are flagged so a second import of the same
// feed does not silently duplicate the club calendar.

eventImportRouter.post("/preview", async (req: Request, res: Response) => {
  if (!(await requireAdminMember(req, res))) return;

  const { url } = req.body as { url?: string };
  if (!url) {
    res.status(400).json({ error: "url is required" });
    return;
  }

  try {
    checkRateLimit(req.memberId!);
    const safe = await assertSafeFeedUrl(url);
    const text = await fetchIcs(safe.toString());

    const now = new Date();
    const events = parseIcs(text, {
      from: new Date(now.getTime() - 30 * 86400000),
      to: new Date(now.getTime() + 180 * 86400000),
    });

    const uids = events.map(e => e.uid).filter(Boolean);
    const existing = uids.length
      ? await prisma.event.findMany({
          where: { externalUid: { in: uids } },
          select: { externalUid: true },
        })
      : [];
    const seen = new Set(existing.map(e => e.externalUid));

    res.json({
      source: safe.host,
      events: events.map(e => ({
        uid: e.uid,
        title: e.title,
        location: e.location,
        start: e.start.toISOString(),
        end: e.end.toISOString(),
        allDay: e.allDay,
        alreadyImported: seen.has(e.uid),
      })),
    });
  } catch (err) {
    if (err instanceof IcsFeedError) {
      res.status(400).json({ error: ICS_ERROR_MESSAGE[err.code], code: err.code });
      return;
    }
    console.error("[event-import] preview error:", err);
    res.status(500).json({ error: "Failed to read that calendar" });
  }
});

// ── POST /api/events/import ──────────────────────────────────

eventImportRouter.post("/", async (req: Request, res: Response) => {
  if (!(await requireAdminMember(req, res))) return;

  const { events, source } = req.body as {
    source?: string;
    events?: { uid: string; title: string; location?: string | null; start: string; end: string; type?: string }[];
  };
  if (!Array.isArray(events) || events.length === 0) {
    res.status(400).json({ error: "events is required" });
    return;
  }
  if (events.length > 200) {
    res.status(400).json({ error: "Import at most 200 events at a time" });
    return;
  }

  const uids = events.map(e => e.uid).filter(Boolean);
  const existing = await prisma.event.findMany({
    where: { externalUid: { in: uids } },
    select: { externalUid: true },
  });
  const seen = new Set(existing.map(e => e.externalUid));

  let created = 0, skipped = 0;
  for (const e of events) {
    if (e.uid && seen.has(e.uid)) { skipped++; continue; }
    const type = e.type && EVENT_TYPES.has(e.type) ? e.type : "OTHER";
    await prisma.event.create({
      data: {
        title: e.title?.slice(0, 300) || "(untitled)",
        type: type as never,
        startTime: new Date(e.start),
        endTime: e.end ? new Date(e.end) : null,
        location: e.location ?? null,
        organizerId: req.memberId,
        externalUid: e.uid || null,
        externalSource: source ?? null,
      },
    });
    created++;
    if (e.uid) seen.add(e.uid);
  }

  res.json({ ok: true, created, skipped });
});
