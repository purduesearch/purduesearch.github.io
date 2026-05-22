import { prisma } from "../db/prisma.js";
import type { EventType } from "@prisma/client";

// ── Types ────────────────────────────────────────────────────

interface CreateEventInput {
  title: string;
  description?: string;
  type?: EventType;
  startTime: Date;
  endTime?: Date;
  location?: string;
  isVirtual?: boolean;
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

function offsetDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

interface RecurrenceCopy {
  title: string;
  type: EventType;
  startTime: Date;
  endTime?: Date;
  organizerId?: string;
  attendeeIds?: string[];
}

function buildRecurringCopies(base: RecurrenceCopy, pattern: string): Date[] {
  // Returns array of startTime offsets for child events (not including the original)
  switch (pattern) {
    case "weekly":   return Array.from({ length: 8  }, (_, i) => offsetDays(base.startTime, 7  * (i + 1)));
    case "biweekly": return Array.from({ length: 4  }, (_, i) => offsetDays(base.startTime, 14 * (i + 1)));
    case "monthly":  return Array.from({ length: 2  }, (_, i) => offsetDays(base.startTime, 30 * (i + 1)));
    default:         return [];
  }
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
    const offsets = buildRecurringCopies(
      { title: data.title, type: data.type ?? "MEETING", startTime: data.startTime, endTime: data.endTime },
      data.recurrencePattern
    );

    if (offsets.length > 0) {
      await Promise.all(
        offsets.map(startTime => {
          const endTime = data.endTime
            ? new Date(startTime.getTime() + (data.endTime!.getTime() - data.startTime.getTime()))
            : undefined;

          return prisma.event.create({
            data: {
              title:             data.title,
              type:              data.type,
              startTime,
              endTime,
              isRecurring:       true,
              recurrencePattern: data.recurrencePattern,
              recurrenceEndDate: data.recurrenceEndDate,
              ...(data.projectId
                ? { project: { connect: { id: data.projectId } } }
                : {}),
              ...(data.organizerId
                ? { organizer: { connect: { id: data.organizerId } } }
                : {}),
              ...(data.attendeeIds?.length
                ? { attendees: { connect: data.attendeeIds.map(id => ({ id })) } }
                : {}),
            },
          });
        })
      );
    }
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

  return prisma.event.update({
    where: { id },
    data:  updateData,
    include: eventInclude,
  });
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
      _count: { select: { priorityTasks: true, attendees: true } },
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
