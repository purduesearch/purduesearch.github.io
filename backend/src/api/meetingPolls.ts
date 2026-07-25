import { Router, type Request, type Response } from "express";
import { requireAuth } from "./auth.js";
import { prisma } from "../db/prisma.js";
import * as pollService from "../services/pollService.js";
import { createNotification } from "../services/notificationCrud.js";
import { queueDm } from "../services/dmBatcher.js";
import type { MeetingPollAudience } from "@prisma/client";

export const meetingPollsRouter = Router();
meetingPollsRouter.use(requireAuth);

const APP_BASE_URL = process.env.APP_BASE_URL ?? "https://purduesearch.github.io";
const AUDIENCES: MeetingPollAudience[] = ["INVITED", "PROJECT", "ANYONE"];

function shareUrl(token: string): string {
  return `${APP_BASE_URL}/schedule/${token}`;
}

// ── Access helpers ───────────────────────────────────────────

type LoadedPoll = NonNullable<Awaited<ReturnType<typeof pollService.getPoll>>>;

function accessShape(poll: LoadedPoll): pollService.PollAccessShape {
  return {
    audience: poll.audience,
    organizerId: poll.organizerId,
    invitedMemberIds: poll.invitedMembers.map(m => m.id),
  };
}

function buildContext(memberId: string, poll: LoadedPoll): Promise<pollService.AccessContext> {
  return pollService.resolveContext(memberId, poll);
}

// Serialize a poll for the client: fields + heatmap + my response + permissions.
export function serializePoll(poll: LoadedPoll, ctx: pollService.AccessContext) {
  const responders = pollService.respondersFrom(poll);
  const agg = pollService.aggregate(poll.slotStarts, responders);
  const mine = ctx.memberId ? poll.responses.find(r => r.memberId === ctx.memberId) : null;
  const shape = accessShape(poll);
  const access = pollService.canRespond(shape, ctx);
  return {
    id: poll.id,
    publicToken: poll.publicToken,
    shareUrl: shareUrl(poll.publicToken),
    title: poll.title,
    description: poll.description,
    timezone: poll.timezone,
    slotMinutes: poll.slotMinutes,
    slotStarts: poll.slotStarts,
    responseDeadline: poll.responseDeadline,
    audience: poll.audience,
    status: poll.status,
    organizer: poll.organizer,
    project: poll.project,
    priorityTasks: poll.priorityTasks,
    invitedMembers: poll.invitedMembers,
    finalStart: poll.finalStart,
    finalEnd: poll.finalEnd,
    event: poll.event,
    createdAt: poll.createdAt,
    responderCount: agg.totalResponders,
    aggregate: agg,
    responders: responders.map(r => ({ memberId: r.memberId, name: r.name, avatarUrl: r.avatarUrl ?? null })),
    myResponse: mine ? { slots: mine.slots } : null,
    permissions: {
      canRespond: access.ok,
      asGuest: access.asGuest,
      canManage: pollService.canManage(shape, ctx),
    },
  };
}

// ── GET /api/meeting-polls — list ────────────────────────────

meetingPollsRouter.get("/", async (req: Request, res: Response) => {
  try {
    const { projectId, status, mine } = req.query as {
      projectId?: string; status?: string; mine?: string;
    };
    const polls = await pollService.listPolls({
      projectId: projectId || undefined,
      status: (status as any) || undefined,
      organizerId: mine === "true" ? (req.memberId as string) : undefined,
    });
    const ctx: pollService.AccessContext = { memberId: req.memberId, isAdmin: false };
    res.json(polls.map(p => serializePoll(p as LoadedPoll, ctx)));
  } catch (error) {
    console.error("List meeting polls error:", error);
    res.status(500).json({ error: "Failed to list polls" });
  }
});

// ── POST /api/meeting-polls — create (any member) ────────────

meetingPollsRouter.post("/", async (req: Request, res: Response) => {
  try {
    const memberId = req.memberId as string;
    const b = req.body as {
      title?: string;
      description?: string;
      timezone?: string;
      slotMinutes?: number;
      slotStarts?: string[];
      responseDeadline?: string | null;
      audience?: MeetingPollAudience;
      projectId?: string | null;
      priorityTaskIds?: string[];
      invitedMemberIds?: string[];
    };

    if (!b.title || !Array.isArray(b.slotStarts) || b.slotStarts.length === 0) {
      res.status(400).json({ error: "title and at least one candidate slot are required" });
      return;
    }
    if (b.audience && !AUDIENCES.includes(b.audience)) {
      res.status(400).json({ error: "invalid audience" });
      return;
    }

    const poll = await pollService.createPoll({
      title: b.title,
      description: b.description,
      timezone: b.timezone,
      slotMinutes: b.slotMinutes,
      slotStarts: b.slotStarts,
      responseDeadline: b.responseDeadline ? new Date(b.responseDeadline) : null,
      audience: b.audience,
      organizerId: memberId,
      projectId: b.projectId ?? null,
      priorityTaskIds: b.priorityTaskIds,
      invitedMemberIds: b.invitedMemberIds,
    });

    await notifyInvitees(poll as LoadedPoll, memberId);

    const ctx = await buildContext(memberId, poll as LoadedPoll);
    res.status(201).json(serializePoll(poll as LoadedPoll, ctx));
  } catch (error) {
    console.error("Create meeting poll error:", error);
    res.status(500).json({ error: "Failed to create poll" });
  }
});

// ── GET /api/meeting-polls/token/:token — resolve share link ─
// (Defined before /:id so "token" isn't captured as an id.)

meetingPollsRouter.get("/token/:token", async (req: Request, res: Response) => {
  try {
    const poll = await pollService.getPollByToken(req.params.token as string);
    if (!poll) { res.status(404).json({ error: "Poll not found" }); return; }
    const ctx = await buildContext(req.memberId as string, poll as LoadedPoll);
    res.json(serializePoll(poll as LoadedPoll, ctx));
  } catch (error) {
    console.error("Get poll by token error:", error);
    res.status(500).json({ error: "Failed to get poll" });
  }
});

// ── GET /api/meeting-polls/:id ───────────────────────────────

meetingPollsRouter.get("/:id", async (req: Request, res: Response) => {
  try {
    const poll = await pollService.getPoll(req.params.id as string);
    if (!poll) { res.status(404).json({ error: "Poll not found" }); return; }
    const ctx = await buildContext(req.memberId as string, poll as LoadedPoll);
    res.json(serializePoll(poll as LoadedPoll, ctx));
  } catch (error) {
    console.error("Get meeting poll error:", error);
    res.status(500).json({ error: "Failed to get poll" });
  }
});

// ── PATCH /api/meeting-polls/:id — organizer/admin ───────────

meetingPollsRouter.patch("/:id", async (req: Request, res: Response) => {
  try {
    const poll = await pollService.getPoll(req.params.id as string);
    if (!poll) { res.status(404).json({ error: "Poll not found" }); return; }
    const ctx = await buildContext(req.memberId as string, poll as LoadedPoll);
    if (!pollService.canManage(accessShape(poll as LoadedPoll), ctx)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const b = req.body as any;
    const updated = await pollService.updatePoll(poll.id, {
      title: b.title,
      description: b.description,
      timezone: b.timezone,
      slotMinutes: b.slotMinutes,
      slotStarts: b.slotStarts,
      responseDeadline: b.responseDeadline !== undefined
        ? (b.responseDeadline ? new Date(b.responseDeadline) : null)
        : undefined,
      audience: b.audience,
      projectId: b.projectId,
      priorityTaskIds: b.priorityTaskIds,
      invitedMemberIds: b.invitedMemberIds,
    });
    res.json(serializePoll(updated as LoadedPoll, ctx));
  } catch (error) {
    console.error("Update meeting poll error:", error);
    res.status(500).json({ error: "Failed to update poll" });
  }
});

// ── DELETE /api/meeting-polls/:id — organizer/admin ──────────

meetingPollsRouter.delete("/:id", async (req: Request, res: Response) => {
  try {
    const poll = await pollService.getPoll(req.params.id as string);
    if (!poll) { res.status(404).json({ error: "Poll not found" }); return; }
    const ctx = await buildContext(req.memberId as string, poll as LoadedPoll);
    if (!pollService.canManage(accessShape(poll as LoadedPoll), ctx)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    await pollService.deletePoll(poll.id);
    res.json({ ok: true });
  } catch (error) {
    console.error("Delete meeting poll error:", error);
    res.status(500).json({ error: "Failed to delete poll" });
  }
});

// ── PUT /api/meeting-polls/:id/response — upsert availability ─

meetingPollsRouter.put("/:id/response", async (req: Request, res: Response) => {
  try {
    const memberId = req.memberId as string;
    const poll = await pollService.getPoll(req.params.id as string);
    if (!poll) { res.status(404).json({ error: "Poll not found" }); return; }
    if (poll.status !== "OPEN") { res.status(409).json({ error: "Poll is closed" }); return; }

    const ctx = await buildContext(memberId, poll as LoadedPoll);
    const access = pollService.canRespond(accessShape(poll as LoadedPoll), ctx);
    if (!access.ok) { res.status(403).json({ error: "Not allowed to respond to this poll" }); return; }

    const { slots } = req.body as { slots?: string[] };
    await pollService.upsertResponse(poll.id, { memberId, slots: slots ?? [] });

    const fresh = await pollService.getPoll(poll.id);
    res.json(serializePoll(fresh as LoadedPoll, ctx));
  } catch (error) {
    console.error("Submit availability error:", error);
    res.status(500).json({ error: "Failed to submit availability" });
  }
});

// ── GET /api/meeting-polls/:id/responses — organizer roster ──

meetingPollsRouter.get("/:id/responses", async (req: Request, res: Response) => {
  try {
    const poll = await pollService.getPoll(req.params.id as string);
    if (!poll) { res.status(404).json({ error: "Poll not found" }); return; }
    const ctx = await buildContext(req.memberId as string, poll as LoadedPoll);
    if (!pollService.canManage(accessShape(poll as LoadedPoll), ctx)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const roster = await pollService.getResponseRoster(poll.id);
    res.json(roster);
  } catch (error) {
    console.error("Get poll responses error:", error);
    res.status(500).json({ error: "Failed to get responses" });
  }
});

// ── POST /api/meeting-polls/:id/remind — nudge non-responders ─

meetingPollsRouter.post("/:id/remind", async (req: Request, res: Response) => {
  try {
    const poll = await pollService.getPoll(req.params.id as string);
    if (!poll) { res.status(404).json({ error: "Poll not found" }); return; }
    const ctx = await buildContext(req.memberId as string, poll as LoadedPoll);
    if (!pollService.canManage(accessShape(poll as LoadedPoll), ctx)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const count = await remindNonResponders(poll as LoadedPoll, req.memberId as string);
    res.json({ ok: true, notified: count });
  } catch (error) {
    console.error("Remind non-responders error:", error);
    res.status(500).json({ error: "Failed to send reminders" });
  }
});

// ── POST /api/meeting-polls/:id/finalize — pick winning slot ──

meetingPollsRouter.post("/:id/finalize", async (req: Request, res: Response) => {
  try {
    const poll = await pollService.getPoll(req.params.id as string);
    if (!poll) { res.status(404).json({ error: "Poll not found" }); return; }
    const ctx = await buildContext(req.memberId as string, poll as LoadedPoll);
    if (!pollService.canManage(accessShape(poll as LoadedPoll), ctx)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const { start, end } = req.body as { start?: string; end?: string };
    if (!start) { res.status(400).json({ error: "start is required" }); return; }

    const { poll: finalized } = await pollService.finalizePoll(poll.id, {
      start: new Date(start),
      end: end ? new Date(end) : null,
    });

    await notifyFinalized(finalized as LoadedPoll);

    res.json(serializePoll(finalized as LoadedPoll, ctx));
  } catch (error) {
    console.error("Finalize poll error:", error);
    res.status(500).json({ error: "Failed to finalize poll" });
  }
});

// ── GET /api/meeting-polls/:id/ics — calendar export ─────────

meetingPollsRouter.get("/:id/ics", async (req: Request, res: Response) => {
  try {
    const poll = await pollService.getPoll(req.params.id as string);
    if (!poll || !poll.finalStart) { res.status(404).json({ error: "No finalized time" }); return; }
    const ics = pollService.buildIcs({
      uid: poll.id,
      title: poll.title,
      description: poll.description,
      start: poll.finalStart,
      end: poll.finalEnd ?? new Date(poll.finalStart.getTime() + poll.slotMinutes * 60_000),
    });
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${poll.id}.ics"`);
    res.send(ics);
  } catch (error) {
    console.error("Poll ics error:", error);
    res.status(500).json({ error: "Failed to build calendar file" });
  }
});

// ── Notification helpers ─────────────────────────────────────

async function notifyInvitees(poll: LoadedPoll, actorId: string): Promise<void> {
  const recipients = poll.invitedMembers.filter(m => m.id !== actorId);
  if (recipients.length === 0) return;

  const url = shareUrl(poll.publicToken);
  const message = `You're invited to fill availability for "${poll.title}"`;

  for (const m of recipients) {
    await createNotification({
      type: "MEETING_POLL_INVITE",
      recipientId: m.id,
      actorId,
      projectId: poll.projectId ?? undefined,
      message,
      metadata: { pollId: poll.id, token: poll.publicToken, url },
    });
    const full = await prisma.member.findUnique({ where: { id: m.id }, select: { slackId: true } });
    if (full?.slackId) queueDm(full.slackId, `🗓️ ${message}: ${url}`);
  }
}

async function notifyFinalized(poll: LoadedPoll): Promise<void> {
  const recipientIds = new Set<string>();
  for (const m of poll.invitedMembers) recipientIds.add(m.id);
  for (const r of poll.responses) if (r.memberId) recipientIds.add(r.memberId);
  if (poll.organizerId) recipientIds.delete(poll.organizerId);

  const when = poll.finalStart
    ? new Date(poll.finalStart).toLocaleString("en-US", { timeZone: poll.timezone })
    : "TBD";
  const message = `Meeting "${poll.title}" is scheduled for ${when}`;

  for (const id of recipientIds) {
    await createNotification({
      type: "MEETING_POLL_FINALIZED",
      recipientId: id,
      actorId: poll.organizerId ?? undefined,
      projectId: poll.projectId ?? undefined,
      message,
      metadata: { pollId: poll.id, eventId: poll.eventId ?? null },
    });
    const full = await prisma.member.findUnique({ where: { id }, select: { slackId: true } });
    if (full?.slackId) queueDm(full.slackId, `✅ ${message}`);
  }
}

export async function remindNonResponders(poll: LoadedPoll, actorId: string | null): Promise<number> {
  const nonResponders = await pollService.getNonResponders(poll.id);
  const url = shareUrl(poll.publicToken);
  const message = `Reminder: fill your availability for "${poll.title}"`;

  let notified = 0;
  for (const m of nonResponders) {
    await createNotification({
      type: "MEETING_POLL_REMINDER",
      recipientId: m.id,
      actorId: actorId ?? undefined,
      projectId: poll.projectId ?? undefined,
      message,
      metadata: { pollId: poll.id, token: poll.publicToken, url },
    });
    const full = await prisma.member.findUnique({ where: { id: m.id }, select: { slackId: true } });
    if (full?.slackId) queueDm(full.slackId, `⏰ ${message}: ${url}`);
    notified++;
  }
  return notified;
}
