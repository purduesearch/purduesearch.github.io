import { Router, type Request, type Response } from "express";
import { requireAuth } from "./auth.js";
import { prisma } from "../db/prisma.js";
import * as eventService from "../services/eventService.js";
import type { EventType } from "@prisma/client";

export const eventsRouter = Router();
eventsRouter.use(requireAuth);

// ── GET /api/events — List with optional filters ─────────────

eventsRouter.get("/", async (req: Request, res: Response) => {
  try {
    const { from, to, projectId, type } = req.query as {
      from?: string;
      to?: string;
      projectId?: string;
      type?: string;
    };

    const events = await eventService.getEvents({
      from:      from      ? new Date(from) : undefined,
      to:        to        ? new Date(to)   : undefined,
      projectId: projectId ?? undefined,
      type:      type      ? (type as EventType) : undefined,
    });

    res.json(events);
  } catch (error) {
    console.error("Get events error:", error);
    res.status(500).json({ error: "Failed to get events" });
  }
});

// ── GET /api/events/upcoming — Next 14 days (dashboard widget)
// IMPORTANT: defined BEFORE /:id to avoid route shadowing.

eventsRouter.get("/upcoming", async (_req: Request, res: Response) => {
  try {
    const events = await eventService.getUpcomingEvents(14);
    res.json(events);
  } catch (error) {
    console.error("Get upcoming events error:", error);
    res.status(500).json({ error: "Failed to get upcoming events" });
  }
});

// ── GET /api/events/:id — Single event ──────────────────────

eventsRouter.get("/:id", async (req: Request, res: Response) => {
  try {
    const event = await eventService.getEvent(req.params.id as string);
    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }
    res.json(event);
  } catch (error) {
    console.error("Get event error:", error);
    res.status(500).json({ error: "Failed to get event" });
  }
});

// ── POST /api/events — Create (admin only) ───────────────────

eventsRouter.post("/", async (req: Request, res: Response) => {
  try {
    const member = await prisma.member.findUnique({
      where: { id: req.session.memberId },
      select: { isAdmin: true },
    });
    if (!member?.isAdmin) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const {
      title,
      description,
      type,
      startTime,
      endTime,
      location,
      isVirtual,
      projectId,
      priorityTaskIds,
      organizerId,
      attendeeIds,
      notes,
      isRecurring,
      recurrencePattern,
      recurrenceEndDate,
    } = req.body as {
      title: string;
      description?: string;
      type?: EventType;
      startTime: string;
      endTime?: string;
      location?: string;
      isVirtual?: boolean;
      projectId?: string;
      priorityTaskIds?: string[];
      organizerId?: string;
      attendeeIds?: string[];
      notes?: string;
      isRecurring?: boolean;
      recurrencePattern?: string;
      recurrenceEndDate?: string;
    };

    if (!title || !startTime) {
      res.status(400).json({ error: "title and startTime are required" });
      return;
    }

    const event = await eventService.createEvent({
      title,
      description,
      type,
      startTime:         new Date(startTime),
      endTime:           endTime           ? new Date(endTime)           : undefined,
      location,
      isVirtual,
      projectId,
      priorityTaskIds,
      organizerId,
      attendeeIds,
      notes,
      isRecurring,
      recurrencePattern,
      recurrenceEndDate: recurrenceEndDate ? new Date(recurrenceEndDate) : undefined,
    });

    res.status(201).json(event);
  } catch (error) {
    console.error("Create event error:", error);
    res.status(500).json({ error: "Failed to create event" });
  }
});

// ── PATCH /api/events/:id — Update (admin only) ──────────────

eventsRouter.patch("/:id", async (req: Request, res: Response) => {
  try {
    const member = await prisma.member.findUnique({
      where: { id: req.session.memberId },
      select: { isAdmin: true },
    });
    if (!member?.isAdmin) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const {
      title,
      description,
      type,
      startTime,
      endTime,
      location,
      isVirtual,
      projectId,
      priorityTaskIds,
      organizerId,
      attendeeIds,
      notes,
      isRecurring,
      recurrencePattern,
      recurrenceEndDate,
    } = req.body as {
      title?: string;
      description?: string;
      type?: EventType;
      startTime?: string;
      endTime?: string;
      location?: string;
      isVirtual?: boolean;
      projectId?: string;
      priorityTaskIds?: string[];
      organizerId?: string;
      attendeeIds?: string[];
      notes?: string;
      isRecurring?: boolean;
      recurrencePattern?: string;
      recurrenceEndDate?: string;
    };

    const event = await eventService.updateEvent(req.params.id as string, {
      title,
      description,
      type,
      startTime:         startTime         ? new Date(startTime)         : undefined,
      endTime:           endTime           ? new Date(endTime)           : undefined,
      location,
      isVirtual,
      projectId,
      priorityTaskIds,
      organizerId,
      attendeeIds,
      notes,
      isRecurring,
      recurrencePattern,
      recurrenceEndDate: recurrenceEndDate ? new Date(recurrenceEndDate) : undefined,
    });

    res.json(event);
  } catch (error) {
    console.error("Update event error:", error);
    res.status(500).json({ error: "Failed to update event" });
  }
});

// ── DELETE /api/events/:id — Delete (admin only) ─────────────

eventsRouter.delete("/:id", async (req: Request, res: Response) => {
  try {
    const member = await prisma.member.findUnique({
      where: { id: req.session.memberId },
      select: { isAdmin: true },
    });
    if (!member?.isAdmin) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    await eventService.deleteEvent(req.params.id as string);
    res.json({ ok: true });
  } catch (error) {
    console.error("Delete event error:", error);
    res.status(500).json({ error: "Failed to delete event" });
  }
});

// ── POST /api/events/:id/attendees — Join or leave ───────────

eventsRouter.post("/:id/attendees", async (req: Request, res: Response) => {
  try {
    const { action } = req.body as { action: "join" | "leave" };
    const memberId   = req.session.memberId;
    const eventId    = req.params.id as string;

    if (action !== "join" && action !== "leave") {
      res.status(400).json({ error: 'action must be "join" or "leave"' });
      return;
    }

    const event = await prisma.event.update({
      where: { id: eventId },
      data: {
        attendees:
          action === "join"
            ? { connect:    { id: memberId } }
            : { disconnect: { id: memberId } },
      },
      include: {
        project:   { select: { id: true, name: true } },
        organizer: { select: { id: true, displayName: true, avatarUrl: true } },
        attendees: { select: { id: true, displayName: true, avatarUrl: true } },
        _count:    { select: { priorityTasks: true, attendees: true } },
      },
    });

    res.json(event);
  } catch (error) {
    console.error("Update event attendees error:", error);
    res.status(500).json({ error: "Failed to update event attendees" });
  }
});
