// Meeting Scheduler (when2meet-style availability polls) service.
//
// Poll candidate slots and each respondent's availability are stored as arrays
// of UTC instants (`slotStarts` / `MeetingResponse.slots`). The grid is derived
// on the client by grouping these by day and rendering in `poll.timezone`.
//
// The pure helpers below (aggregate, bestSlots, canRespond, canManage, buildIcs)
// take plain data and are unit-tested without a database — they hold the risky
// logic. The DB functions wrap them.

import { prisma } from "../db/prisma.js";
import * as rewardService from "./rewardService.js";
import type { MeetingPollAudience } from "@prisma/client";

// ── Pure helpers ─────────────────────────────────────────────

/** Normalise a Date | ISO string to its canonical ISO string (ms precision). */
export function slotKey(d: Date | string): string {
  return (d instanceof Date ? d : new Date(d)).toISOString();
}

export interface ResponderInput {
  memberId: string | null;
  name: string;
  avatarUrl?: string | null;
  slots: Array<Date | string>;
}

export interface PollAggregate {
  totalResponders: number;
  /** slotKey → responder names available at that slot */
  perSlot: Record<string, string[]>;
  /** slotKey → count available */
  counts: Record<string, number>;
  /** slot(s) with the highest count, earliest start first */
  bestSlotStarts: string[];
  maxCount: number;
}

/**
 * Build the heatmap: for each candidate slot, who is available. Best slot is the
 * one with the most available responders, ties broken by earliest start.
 * Responses referencing slots no longer in `slotStarts` (after a grid edit) are
 * ignored — data is never mutated here.
 */
export function aggregate(
  slotStarts: Array<Date | string>,
  responders: ResponderInput[]
): PollAggregate {
  const keys = slotStarts.map(slotKey);
  const keySet = new Set(keys);
  const perSlot: Record<string, string[]> = {};
  const counts: Record<string, number> = {};
  for (const k of keys) {
    perSlot[k] = [];
    counts[k] = 0;
  }

  for (const r of responders) {
    for (const s of r.slots) {
      const k = slotKey(s);
      if (!keySet.has(k)) continue;
      perSlot[k].push(r.name);
      counts[k] += 1;
    }
  }

  let maxCount = 0;
  for (const k of keys) maxCount = Math.max(maxCount, counts[k]);

  const bestSlotStarts =
    maxCount > 0
      ? keys
          .filter(k => counts[k] === maxCount)
          .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())
      : [];

  return { totalResponders: responders.length, perSlot, counts, bestSlotStarts, maxCount };
}

export interface PollAccessShape {
  audience: MeetingPollAudience;
  organizerId: string | null;
  invitedMemberIds: string[];
}

export interface AccessContext {
  memberId?: string | null;
  isAdmin?: boolean;
  isProjectMember?: boolean; // caller resolves via ProjectMember for PROJECT audience
}

/** Only the organizer or an admin may edit / finalize / delete a poll. */
export function canManage(poll: PollAccessShape, ctx: AccessContext): boolean {
  if (ctx.isAdmin) return true;
  return !!ctx.memberId && poll.organizerId === ctx.memberId;
}

/**
 * Whether the viewer may submit availability, and whether they do so as a guest.
 * Guests (no memberId) are permitted only when the audience is ANYONE.
 */
export function canRespond(
  poll: PollAccessShape,
  ctx: AccessContext
): { ok: boolean; asGuest: boolean } {
  const isMember = !!ctx.memberId;

  if (!isMember) {
    return { ok: poll.audience === "ANYONE", asGuest: true };
  }

  // Members always respond as themselves.
  if (ctx.isAdmin || poll.organizerId === ctx.memberId) return { ok: true, asGuest: false };

  switch (poll.audience) {
    case "ANYONE":
      return { ok: true, asGuest: false };
    case "INVITED":
      return { ok: poll.invitedMemberIds.includes(ctx.memberId!), asGuest: false };
    case "PROJECT":
      return { ok: !!ctx.isProjectMember, asGuest: false };
    default:
      return { ok: false, asGuest: false };
  }
}

// ── iCalendar export ─────────────────────────────────────────

function icsEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

function icsStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

/** Minimal RFC-5545 VEVENT for a finalized meeting. */
export function buildIcs(evt: {
  uid: string;
  title: string;
  description?: string | null;
  location?: string | null;
  start: Date;
  end: Date;
}): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//SEARCH ClubPM//Meeting Scheduler//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    // Deliberately still @purduesearch.github.io after the move to
    // purduesearch.org. An iCalendar UID is an opaque global identifier, never
    // resolved as a URL — the domain is only a uniqueness convention. Changing
    // the suffix would make every already-subscribed calendar client treat
    // existing events as brand-new ones, duplicating them on real calendars
    // with no way to retract. Leave it alone.
    `UID:${evt.uid}@purduesearch.github.io`,
    `DTSTAMP:${icsStamp(new Date())}`,
    `DTSTART:${icsStamp(evt.start)}`,
    `DTEND:${icsStamp(evt.end)}`,
    `SUMMARY:${icsEscape(evt.title)}`,
    ...(evt.description ? [`DESCRIPTION:${icsEscape(evt.description)}`] : []),
    ...(evt.location ? [`LOCATION:${icsEscape(evt.location)}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.join("\r\n");
}

// ── Shared include shapes ────────────────────────────────────

const pollInclude = {
  organizer:     { select: { id: true, displayName: true, avatarUrl: true } },
  project:       { select: { id: true, name: true } },
  priorityTasks: { select: { id: true, title: true, status: true, priority: true } },
  invitedMembers:{ select: { id: true, displayName: true, avatarUrl: true } },
  responses: {
    include: { member: { select: { id: true, displayName: true, avatarUrl: true } } },
    orderBy: { createdAt: "asc" as const },
  },
  event:         { select: { id: true, startTime: true, endTime: true } },
  _count:        { select: { responses: true } },
} as const;

// ── Types ────────────────────────────────────────────────────

export interface CreatePollInput {
  title: string;
  description?: string;
  timezone?: string;
  slotMinutes?: number;
  slotStarts: Array<Date | string>;
  responseDeadline?: Date | null;
  audience?: MeetingPollAudience;
  organizerId: string;
  projectId?: string | null;
  priorityTaskIds?: string[];
  invitedMemberIds?: string[];
}

export interface UpdatePollInput {
  title?: string;
  description?: string | null;
  timezone?: string;
  slotMinutes?: number;
  slotStarts?: Array<Date | string>;
  responseDeadline?: Date | null;
  audience?: MeetingPollAudience;
  projectId?: string | null;
  priorityTaskIds?: string[];
  invitedMemberIds?: string[];
}

// ── CRUD ─────────────────────────────────────────────────────

export async function createPoll(data: CreatePollInput) {
  return prisma.meetingPoll.create({
    data: {
      title:            data.title,
      description:      data.description,
      timezone:         data.timezone ?? "America/New_York",
      slotMinutes:      data.slotMinutes ?? 30,
      slotStarts:       (data.slotStarts ?? []).map(s => new Date(s)),
      responseDeadline: data.responseDeadline ?? null,
      audience:         data.audience ?? "INVITED",
      organizer:        { connect: { id: data.organizerId } },
      ...(data.projectId ? { project: { connect: { id: data.projectId } } } : {}),
      ...(data.priorityTaskIds?.length
        ? { priorityTasks: { connect: data.priorityTaskIds.map(id => ({ id })) } }
        : {}),
      ...(data.invitedMemberIds?.length
        ? { invitedMembers: { connect: data.invitedMemberIds.map(id => ({ id })) } }
        : {}),
    },
    include: pollInclude,
  });
}

export async function updatePoll(id: string, data: UpdatePollInput) {
  const d: any = {};
  if (data.title            !== undefined) d.title            = data.title;
  if (data.description      !== undefined) d.description      = data.description;
  if (data.timezone         !== undefined) d.timezone         = data.timezone;
  if (data.slotMinutes      !== undefined) d.slotMinutes      = data.slotMinutes;
  if (data.slotStarts       !== undefined) d.slotStarts       = data.slotStarts.map(s => new Date(s));
  if (data.responseDeadline !== undefined) d.responseDeadline = data.responseDeadline;
  if (data.audience         !== undefined) d.audience         = data.audience;
  if (data.projectId !== undefined) {
    d.project = data.projectId ? { connect: { id: data.projectId } } : { disconnect: true };
  }
  if (data.priorityTaskIds !== undefined) {
    d.priorityTasks = { set: data.priorityTaskIds.map(id => ({ id })) };
  }
  if (data.invitedMemberIds !== undefined) {
    d.invitedMembers = { set: data.invitedMemberIds.map(id => ({ id })) };
  }
  return prisma.meetingPoll.update({ where: { id }, data: d, include: pollInclude });
}

export async function deletePoll(id: string) {
  return prisma.meetingPoll.delete({ where: { id } });
}

export async function getPoll(id: string) {
  return prisma.meetingPoll.findUnique({ where: { id }, include: pollInclude });
}

export async function getPollByToken(token: string) {
  return prisma.meetingPoll.findUnique({ where: { publicToken: token }, include: pollInclude });
}

/**
 * Resolve a member's access context against a poll (admin flag + project
 * membership). Shared by the authed router and the public/guest endpoints.
 */
export async function resolveContext(
  memberId: string | null | undefined,
  poll: { projectId: string | null }
): Promise<AccessContext> {
  if (!memberId) return { memberId: null, isAdmin: false, isProjectMember: false };
  const member = await prisma.member.findUnique({ where: { id: memberId }, select: { isAdmin: true } });
  let isProjectMember = false;
  if (poll.projectId) {
    const pm = await prisma.projectMember.findUnique({
      where: { projectId_memberId: { projectId: poll.projectId, memberId } },
      select: { memberId: true },
    });
    isProjectMember = !!pm;
  }
  return { memberId, isAdmin: !!member?.isAdmin, isProjectMember };
}

export interface ListFilters {
  projectId?: string;
  status?: "OPEN" | "FINALIZED" | "CANCELED";
  organizerId?: string;
}

export async function listPolls(filters: ListFilters = {}) {
  const where: any = {};
  if (filters.projectId)   where.projectId   = filters.projectId;
  if (filters.status)      where.status      = filters.status;
  if (filters.organizerId) where.organizerId = filters.organizerId;
  return prisma.meetingPoll.findMany({
    where,
    include: pollInclude,
    orderBy: { createdAt: "desc" },
  });
}

// ── Responses ────────────────────────────────────────────────

export type PollWithResponses = NonNullable<Awaited<ReturnType<typeof getPoll>>>;

/** Map a loaded poll's responses into the pure-aggregate input shape. */
export function respondersFrom(poll: PollWithResponses): ResponderInput[] {
  return poll.responses.map(r => ({
    memberId: r.memberId,
    name: r.member?.displayName ?? r.guestName ?? "Guest",
    avatarUrl: r.member?.avatarUrl ?? null,
    slots: r.slots,
  }));
}

/**
 * Upsert a respondent's availability. Members are keyed by memberId (one row per
 * member per poll); guests create a fresh row each call under their name.
 * The first time a member submits, a configured XP/doubloon reward is granted.
 */
export async function upsertResponse(
  pollId: string,
  input: { memberId?: string | null; guestName?: string | null; slots: Array<Date | string> }
) {
  const poll = await prisma.meetingPoll.findUnique({
    where: { id: pollId },
    select: { slotStarts: true },
  });
  if (!poll) throw Object.assign(new Error("Poll not found"), { status: 404 });

  // Keep only slots that are real candidate slots on this poll.
  const valid = new Set(poll.slotStarts.map(slotKey));
  const slots = input.slots.map(s => new Date(s)).filter(s => valid.has(slotKey(s)));

  if (input.memberId) {
    const existing = await prisma.meetingResponse.findUnique({
      where: { pollId_memberId: { pollId, memberId: input.memberId } },
      select: { id: true, rewarded: true },
    });

    const row = await prisma.meetingResponse.upsert({
      where:  { pollId_memberId: { pollId, memberId: input.memberId } },
      update: { slots },
      create: { pollId, memberId: input.memberId, slots },
      include: { member: { select: { id: true, displayName: true, avatarUrl: true } } },
    });

    // Reward once per member per poll, on first submission.
    if (!existing?.rewarded) {
      await rewardService.handleMeetingAvailabilitySubmitted(input.memberId);
      await prisma.meetingResponse.update({ where: { id: row.id }, data: { rewarded: true } });
    }
    return row;
  }

  // Guest: no unique key on guestName, so upsert by (pollId, guestName) manually.
  const name = (input.guestName ?? "").trim() || "Guest";
  const prior = await prisma.meetingResponse.findFirst({
    where: { pollId, memberId: null, guestName: name },
    select: { id: true },
  });
  if (prior) {
    return prisma.meetingResponse.update({ where: { id: prior.id }, data: { slots } });
  }
  return prisma.meetingResponse.create({ data: { pollId, memberId: null, guestName: name, slots } });
}

/** Organizer roster: who has responded and (for invited polls) who hasn't. */
export async function getResponseRoster(pollId: string) {
  const poll = await prisma.meetingPoll.findUnique({
    where: { id: pollId },
    include: {
      invitedMembers: { select: { id: true, displayName: true, avatarUrl: true } },
      responses: {
        include: { member: { select: { id: true, displayName: true, avatarUrl: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!poll) return null;

  const respondedMemberIds = new Set(poll.responses.map(r => r.memberId).filter(Boolean) as string[]);
  const notResponded = poll.invitedMembers.filter(m => !respondedMemberIds.has(m.id));

  return {
    responded: poll.responses,
    notResponded,
    respondedCount: poll.responses.length,
    invitedCount: poll.invitedMembers.length,
  };
}

/** Invited members who have not submitted availability (for reminder nudges). */
export async function getNonResponders(pollId: string) {
  const roster = await getResponseRoster(pollId);
  return roster?.notResponded ?? [];
}

// ── Finalize → Event ─────────────────────────────────────────

/**
 * Finalize a poll on a chosen slot. Creates (or re-links) an Event whose
 * attendees are the members who marked the chosen start available, carrying
 * over the poll's project + priority tasks. Poll and Event stay linked.
 */
export async function finalizePoll(
  pollId: string,
  opts: { start: Date; end?: Date | null }
) {
  const poll = await prisma.meetingPoll.findUnique({
    where: { id: pollId },
    include: {
      responses: { select: { memberId: true, slots: true } },
      priorityTasks: { select: { id: true } },
    },
  });
  if (!poll) throw Object.assign(new Error("Poll not found"), { status: 404 });

  const startKey = slotKey(opts.start);
  const end = opts.end ?? new Date(opts.start.getTime() + poll.slotMinutes * 60_000);

  const attendeeIds = Array.from(
    new Set(
      poll.responses
        .filter(r => r.memberId && r.slots.some(s => slotKey(s) === startKey))
        .map(r => r.memberId as string)
    )
  );

  const eventData = {
    title:       poll.title,
    description: poll.description,
    type:        "MEETING" as const,
    startTime:   opts.start,
    endTime:     end,
    ...(poll.projectId   ? { project:   { connect: { id: poll.projectId } } }   : {}),
    ...(poll.organizerId ? { organizer: { connect: { id: poll.organizerId } } } : {}),
    ...(attendeeIds.length
      ? { attendees: { connect: attendeeIds.map(id => ({ id })) } }
      : {}),
    ...(poll.priorityTasks.length
      ? { priorityTasks: { connect: poll.priorityTasks.map(t => ({ id: t.id })) } }
      : {}),
  };

  let eventId = poll.eventId;
  if (eventId) {
    await prisma.event.update({
      where: { id: eventId },
      data: {
        title: poll.title, description: poll.description,
        startTime: opts.start, endTime: end,
        attendees: { set: attendeeIds.map(id => ({ id })) },
      },
    });
  } else {
    const event = await prisma.event.create({ data: eventData });
    eventId = event.id;
  }

  const updated = await prisma.meetingPoll.update({
    where: { id: pollId },
    data: {
      status:     "FINALIZED",
      finalStart: opts.start,
      finalEnd:   end,
      event:      { connect: { id: eventId } },
    },
    include: pollInclude,
  });

  return { poll: updated, eventId, attendeeIds };
}
