import { prisma } from "../db/prisma.js";
import type { EventType } from "@prisma/client";
import { recurrenceStarts } from "./eventRecurrence.js";

// ── Types ────────────────────────────────────────────────────

interface CreateEventInput {
  title: string;
  description?: string;
  type?: EventType;
  startTime: Date;
  endTime?: Date;
  location?: string;
  isVirtual?: boolean;
  isPublic?: boolean;
  projectId?: string;
  priorityTaskIds?: string[];
  organizerId?: string;
  attendeeIds?: string[];
  notes?: string;
  isRecurring?: boolean;
  recurrencePattern?: string;
  recurrenceEndDate?: Date;
}

interface UpdateEventInput {
  title?: string;
  description?: string;
  type?: EventType;
  startTime?: Date;
  endTime?: Date;
  location?: string;
  isVirtual?: boolean;
  isPublic?: boolean;
  projectId?: string;
  priorityTaskIds?: string[];
  organizerId?: string;
  attendeeIds?: string[];
  notes?: string;
  isRecurring?: boolean;
  recurrencePattern?: string;
  recurrenceEndDate?: Date;
}

interface EventFilters {
  from?: Date;
  to?: Date;
  projectId?: string;
  type?: EventType;
}

// ── Shared include shape ─────────────────────────────────────

const eventInclude = {
  project:   { select: { id: true, name: true } },
  organizer: { select: { id: true, displayName: true, avatarUrl: true } },
  attendees: { select: { id: true, displayName: true, avatarUrl: true } },
  _count:    { select: { priorityTasks: true, attendees: true } },
} as const;

// ── Recurrence Helpers ───────────────────────────────────────

interface SeriesBase {
  title: string;
  description?: string | null;
  type?: EventType;
  startTime: Date;
  endTime?: Date | null;
  location?: string | null;
  isVirtual?: boolean;
  isPublic: boolean;
  recurrencePattern: string;
  recurrenceEndDate?: Date | null;
  projectId?: string | null;
  organizerId?: string | null;
  attendeeIds?: string[];
}

// Creates the future copies of a recurring event (not the original itself).
// Occurrence dates come from eventRecurrence.ts, which honours the series end
// date and keeps the local wall-clock time across DST.
async function spawnOccurrences(base: SeriesBase) {
  const starts = recurrenceStarts(base.startTime, base.recurrencePattern, base.recurrenceEndDate);
  const duration = base.endTime ? base.endTime.getTime() - base.startTime.getTime() : null;

  await Promise.all(
    starts.map(startTime =>
      prisma.event.create({
        data: {
          title:             base.title,
          type:              base.type,
          startTime,
          endTime:           duration !== null ? new Date(startTime.getTime() + duration) : undefined,
          description:       base.description ?? undefined,
          location:          base.location ?? undefined,
          isVirtual:         base.isVirtual,
          isPublic:          base.isPublic,
          isRecurring:       true,
          recurrencePattern: base.recurrencePattern,
          recurrenceEndDate: base.recurrenceEndDate ?? undefined,
          ...(base.projectId
            ? { project: { connect: { id: base.projectId } } }
            : {}),
          ...(base.organizerId
            ? { organizer: { connect: { id: base.organizerId } } }
            : {}),
          ...(base.attendeeIds?.length
            ? { attendees: { connect: base.attendeeIds.map(id => ({ id })) } }
            : {}),
        },
      })
    )
  );
}

// DEADLINE events are never published, whatever the caller asked for. The
// public API also filters DEADLINE out, but storing false keeps the eye icon
// in ClubPM honest.
function resolveIsPublic(type: EventType | undefined, requested: boolean | undefined): boolean {
  if (type === "DEADLINE") return false;
  return requested ?? false;
}

// ── Service ──────────────────────────────────────────────────

export async function createEvent(data: CreateEventInput) {
  const event = await prisma.event.create({
    data: {
      title:              data.title,
      description:        data.description,
      type:               data.type,
      startTime:          data.startTime,
      endTime:            data.endTime,
      location:           data.location,
      isVirtual:          data.isVirtual,
      isPublic:           resolveIsPublic(data.type, data.isPublic),
      notes:              data.notes,
      isRecurring:        data.isRecurring,
      recurrencePattern:  data.recurrencePattern,
      recurrenceEndDate:  data.recurrenceEndDate,
      ...(data.projectId
        ? { project: { connect: { id: data.projectId } } }
        : {}),
      ...(data.organizerId
        ? { organizer: { connect: { id: data.organizerId } } }
        : {}),
      ...(data.attendeeIds?.length
        ? { attendees: { connect: data.attendeeIds.map(id => ({ id })) } }
        : {}),
      ...(data.priorityTaskIds?.length
        ? { priorityTasks: { connect: data.priorityTaskIds.map(id => ({ id })) } }
        : {}),
    },
    include: eventInclude,
  });

  // Spawn recurring child events if applicable
  if (data.isRecurring && data.recurrencePattern) {
    await spawnOccurrences({
      ...data,
      isPublic:          event.isPublic,
      recurrencePattern: data.recurrencePattern,
    });
  }

  return event;
}

export async function updateEvent(id: string, data: UpdateEventInput) {
  const updateData: any = {};

  if (data.title             !== undefined) updateData.title             = data.title;
  if (data.description       !== undefined) updateData.description       = data.description;
  if (data.type              !== undefined) updateData.type              = data.type;
  if (data.startTime         !== undefined) updateData.startTime         = data.startTime;
  if (data.endTime           !== undefined) updateData.endTime           = data.endTime;
  if (data.location          !== undefined) updateData.location          = data.location;
  if (data.isVirtual         !== undefined) updateData.isVirtual         = data.isVirtual;
  if (data.isPublic !== undefined) updateData.isPublic = resolveIsPublic(data.type, data.isPublic);
  // Switching an existing event to DEADLINE unpublishes it even if the caller
  // didn't mention isPublic.
  if (data.type === "DEADLINE") updateData.isPublic = false;
  if (data.notes             !== undefined) updateData.notes             = data.notes;
  if (data.isRecurring       !== undefined) updateData.isRecurring       = data.isRecurring;
  if (data.recurrencePattern !== undefined) updateData.recurrencePattern = data.recurrencePattern;
  if (data.recurrenceEndDate !== undefined) updateData.recurrenceEndDate = data.recurrenceEndDate;

  if (data.projectId !== undefined) {
    updateData.project = data.projectId
      ? { connect: { id: data.projectId } }
      : { disconnect: true };
  }
  if (data.organizerId !== undefined) {
    updateData.organizer = data.organizerId
      ? { connect: { id: data.organizerId } }
      : { disconnect: true };
  }
  if (data.attendeeIds !== undefined) {
    updateData.attendees = { set: data.attendeeIds.map(id => ({ id })) };
  }
  if (data.priorityTaskIds !== undefined) {
    updateData.priorityTasks = { set: data.priorityTaskIds.map(id => ({ id })) };
  }

  // Turning recurrence on for an existing one-off event creates its future
  // occurrences, same as creating it recurring would have. Already-recurring
  // events are left alone so re-saving a series never duplicates it.
  const wasRecurring = data.isRecurring
    ? (await prisma.event.findUnique({ where: { id }, select: { isRecurring: true } }))?.isRecurring ?? false
    : true;

  const updated = await prisma.event.update({
    where: { id },
    data:  updateData,
    include: eventInclude,
  });

  if (!wasRecurring && updated.isRecurring && updated.recurrencePattern) {
    await spawnOccurrences({
      ...updated,
      recurrencePattern: updated.recurrencePattern,
      attendeeIds:       updated.attendees.map(a => a.id),
    });
  }

  return updated;
}

export async function deleteEvent(id: string) {
  return prisma.event.delete({ where: { id } });
}

export async function getEvents(filters: EventFilters = {}) {
  const where: any = {};

  if (filters.from || filters.to) {
    where.startTime = {};
    if (filters.from) where.startTime.gte = filters.from;
    if (filters.to)   where.startTime.lte = filters.to;
  }
  if (filters.projectId) where.projectId = filters.projectId;
  if (filters.type)      where.type      = filters.type;

  return prisma.event.findMany({
    where,
    include:  eventInclude,
    orderBy:  { startTime: "asc" },
  });
}

export async function getUpcomingEvents(days: number) {
  const now = new Date();
  const future = new Date();
  future.setDate(future.getDate() + days);

  return prisma.event.findMany({
    where: {
      startTime: { gte: now, lte: future },
    },
    include: {
      project:      { select: { id: true, name: true } },
      organizer:    { select: { id: true, displayName: true, avatarUrl: true } },
      attendees:    { select: { id: true, displayName: true, avatarUrl: true } },
      priorityTasks: {
        select: { id: true, title: true, status: true },
      },
      _count: { select: { priorityTasks: true, attendees: true, rsvps: true } },
      rsvps: {
        where:  { attended: true },
        select: { id: true },
      },
    },
    orderBy: { startTime: "asc" },
  });
}

export async function getProjectEvents(projectId: string) {
  return prisma.event.findMany({
    where:   { projectId },
    include: eventInclude,
    orderBy: { startTime: "asc" },
  });
}

export async function getEvent(id: string) {
  return prisma.event.findUnique({
    where: { id },
    include: {
      project:       { select: { id: true, name: true } },
      organizer:     { select: { id: true, displayName: true, avatarUrl: true } },
      attendees:     { select: { id: true, displayName: true, avatarUrl: true } },
      priorityTasks: { select: { id: true, title: true, status: true, priority: true } },
      _count:        { select: { priorityTasks: true, attendees: true } },
    },
  });
}

export type { CreateEventInput, UpdateEventInput, EventFilters };
