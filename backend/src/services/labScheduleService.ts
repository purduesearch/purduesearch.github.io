/**
 * Lab schedule persistence + notifications. Pure logic lives in labScheduleCore.ts.
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { createNotification } from "./notificationCrud.js";
import {
  addDays, weekDates, mondayOf, toDbDate, fromDbDate, todayIn, isYmd,
  expandShifts, eventToBand, mergePresence, validateApply, planErase, rectToShifts,
  overlapsFor, describeDrafts, describeOverlaps,
  type ShiftRow, type SkipRow, type ShiftDraft, type Ymd,
} from "./labScheduleCore.js";
import { getWorkspace, canSchedule, isAdminMember, requirementStatus, type WorkspaceDto } from "./workspaceService.js";

export class LabScheduleError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const BUDDY_WINDOW_DAYS = 14;
const DAY_MS = 86_400_000;

type DbShift = {
  id: string; memberId: string; weekday: number; startMin: number; endMin: number;
  startsOn: Date; endsOn: Date; buddyWanted: boolean; skips?: { date: Date }[];
};

function toRow(s: DbShift): ShiftRow {
  return {
    id: s.id, memberId: s.memberId, weekday: s.weekday, startMin: s.startMin, endMin: s.endMin,
    startsOn: fromDbDate(s.startsOn), endsOn: fromDbDate(s.endsOn), buddyWanted: s.buddyWanted,
  };
}
function toSkips(s: DbShift): SkipRow[] {
  return (s.skips ?? []).map(k => ({ shiftId: s.id, date: fromDbDate(k.date) }));
}
function draftToData(d: ShiftDraft) {
  return {
    weekday: d.weekday, startMin: d.startMin, endMin: d.endMin,
    startsOn: toDbDate(d.startsOn), endsOn: toDbDate(d.endsOn), buddyWanted: d.buddyWanted,
  };
}
function partialToData(p: Partial<ShiftDraft>): Prisma.LabShiftUpdateInput {
  const out: Prisma.LabShiftUpdateInput = {};
  if (p.startMin !== undefined) out.startMin = p.startMin;
  if (p.endMin !== undefined) out.endMin = p.endMin;
  if (p.startsOn !== undefined) out.startsOn = toDbDate(p.startsOn);
  if (p.endsOn !== undefined) out.endsOn = toDbDate(p.endsOn);
  if (p.buddyWanted !== undefined) out.buddyWanted = p.buddyWanted;
  return out;
}
function windowDates(today: Ymd): Ymd[] {
  return Array.from({ length: BUDDY_WINDOW_DAYS }, (_, i) => addDays(today, i));
}
async function actorName(memberId: string): Promise<string> {
  const m = await prisma.member.findUnique({ where: { id: memberId }, select: { displayName: true } });
  return m?.displayName ?? "A teammate";
}
const labLink = (workspaceId: string) => `/clubpm/calendar?lab=${workspaceId}`;

// ── Read ─────────────────────────────────────────────────────

export async function getWeek(workspaceId: string, anyDayInWeek: Ymd, viewerId: string) {
  const ws = await getWorkspace(workspaceId);
  if (!ws) throw new LabScheduleError(404, "Lab space not found");
  const dates = weekDates(mondayOf(anyDayInWeek));
  const first = dates[0], last = dates[6];

  const [shifts, events, viewerIsAdmin] = await Promise.all([
    prisma.labShift.findMany({
      where: { workspaceId, startsOn: { lte: toDbDate(last) }, endsOn: { gte: toDbDate(first) } },
      include: { skips: true, member: { select: { id: true, displayName: true, avatarUrl: true, slackId: true } } },
    }),
    prisma.event.findMany({
      where: {
        workspaceId,
        startTime: { gte: new Date(toDbDate(first).getTime() - DAY_MS), lt: new Date(toDbDate(last).getTime() + 2 * DAY_MS) },
      },
      select: { id: true, title: true, startTime: true, endTime: true, attendees: { select: { id: true, displayName: true, avatarUrl: true, slackId: true } } },
      orderBy: { startTime: "asc" },
    }),
    isAdminMember(viewerId),
  ]);

  const rows = shifts.map(toRow);
  const occurrences = expandShifts(rows, shifts.flatMap(toSkips), dates);
  const bands = events
    .map(e => eventToBand({ id: e.id, title: e.title, startTime: e.startTime, endTime: e.endTime, attendeeIds: e.attendees.map(a => a.id) }, ws.timezone))
    .filter(b => dates.includes(b.date));
  const blocks = dates.flatMap(d => mergePresence(d, occurrences, bands));

  const people = new Map<string, { id: string; displayName: string; avatarUrl: string | null; slackId: string }>();
  for (const s of shifts) people.set(s.member.id, s.member);
  for (const e of events) for (const a of e.attendees) people.set(a.id, a);
  const ids = [...people.keys()];

  const [memberships, reqStatus, mayEdit] = await Promise.all([
    prisma.projectMember.findMany({
      where: { memberId: { in: ids }, project: { workspaces: { some: { workspaceId } } } },
      select: { memberId: true, project: { select: { id: true, name: true } } },
    }),
    requirementStatus(ws, [...ids, viewerId]),
    canSchedule(viewerId, workspaceId, viewerIsAdmin),
  ]);

  return {
    workspace: ws,
    dates,
    blocks,
    events: bands,
    occurrences,
    myShifts: rows.filter(r => r.memberId === viewerId),
    members: ids.map(id => ({ ...people.get(id)!, projects: memberships.filter(m => m.memberId === id).map(m => m.project) })),
    requirementStatus: reqStatus,
    canSchedule: mayEdit && !ws.archived,
  };
}

// ── Write ────────────────────────────────────────────────────

export async function applyRect(memberId: string, workspaceId: string, body: unknown) {
  const ws = await getWorkspace(workspaceId);
  if (!ws) throw new LabScheduleError(404, "Lab space not found");
  if (ws.archived) throw new LabScheduleError(400, "This space is archived.");
  const admin = await isAdminMember(memberId);
  if (!(await canSchedule(memberId, workspaceId, admin))) {
    throw new LabScheduleError(403, "Only members of projects assigned to this space can schedule here.");
  }
  const today = todayIn(ws.timezone);
  const parsed = validateApply(body, ws, today);
  if (!parsed.ok) throw new LabScheduleError(400, parsed.error);
  const v = parsed.value;

  // `add` is erase-then-insert over the same rectangle, so repeated drags never stack.
  const own = await prisma.labShift.findMany({
    where: { workspaceId, memberId, endsOn: { gte: toDbDate(v.dates[0]) } },
    include: { skips: true },
  });
  const plan = planErase(own.map(toRow), own.flatMap(toSkips), v);
  const drafts = v.op === "add" ? rectToShifts(v) : [];
  const creates = [...plan.creates, ...drafts];

  await prisma.$transaction([
    ...(plan.deletes.length ? [prisma.labShift.deleteMany({ where: { id: { in: plan.deletes }, memberId } })] : []),
    ...plan.updates.map(u => prisma.labShift.update({ where: { id: u.id }, data: partialToData(u.data) })),
    ...(creates.length ? [prisma.labShift.createMany({ data: creates.map(d => ({ ...draftToData(d), memberId, workspaceId })) })] : []),
    ...(plan.skips.length
      ? [prisma.labShiftSkip.createMany({ data: plan.skips.map(s => ({ shiftId: s.shiftId, date: toDbDate(s.date) })), skipDuplicates: true })]
      : []),
  ]);

  if (drafts.length) {
    await notifyBuddyJoined(memberId, ws, drafts, today)
      .catch(err => console.error("[labSchedule] buddy-joined notify failed:", err));
    if (v.buddyWanted) {
      await notifyBuddyWanted(memberId, ws, drafts)
        .catch(err => console.error("[labSchedule] buddy-wanted notify failed:", err));
    }
  }
  return getWeek(workspaceId, v.dates[0], memberId);
}

export async function updateShift(shiftId: string, actorId: string, body: unknown) {
  const shift = await prisma.labShift.findUnique({ where: { id: shiftId } });
  if (!shift) throw new LabScheduleError(404, "Lab time not found");
  if (shift.memberId !== actorId && !(await isAdminMember(actorId))) {
    throw new LabScheduleError(403, "You can only change your own lab time.");
  }
  const b = (body ?? {}) as Record<string, unknown>;
  const data: Prisma.LabShiftUpdateInput = {};
  if (b.buddyWanted !== undefined) {
    if (typeof b.buddyWanted !== "boolean") throw new LabScheduleError(400, "buddyWanted must be true or false.");
    data.buddyWanted = b.buddyWanted;
  }
  if (b.note !== undefined) {
    if (b.note !== null && (typeof b.note !== "string" || b.note.length > 280)) throw new LabScheduleError(400, "Note must be up to 280 characters.");
    data.note = typeof b.note === "string" && b.note.trim() ? b.note.trim() : null;
  }
  if (b.endsOn !== undefined) {
    if (!isYmd(b.endsOn) || b.endsOn < fromDbDate(shift.startsOn)) throw new LabScheduleError(400, "Until date must be on or after the start date.");
    data.endsOn = toDbDate(b.endsOn);
  }
  const updated = await prisma.labShift.update({ where: { id: shiftId }, data });
  if (data.buddyWanted === true && !shift.buddyWanted) {
    const ws = await getWorkspace(shift.workspaceId);
    if (ws) {
      await notifyBuddyWanted(shift.memberId, ws, [toRow(updated)])
        .catch(err => console.error("[labSchedule] buddy-wanted notify failed:", err));
    }
  }
  return toRow(updated);
}

export async function deleteShift(shiftId: string, actorId: string): Promise<void> {
  const shift = await prisma.labShift.findUnique({ where: { id: shiftId }, select: { memberId: true } });
  if (!shift) throw new LabScheduleError(404, "Lab time not found");
  if (shift.memberId !== actorId && !(await isAdminMember(actorId))) {
    throw new LabScheduleError(403, "You can only remove your own lab time.");
  }
  await prisma.labShift.delete({ where: { id: shiftId } });
}

export async function listBuddyRequests(viewerId: string, projectId?: string) {
  const projectIds = projectId
    ? [projectId]
    : (await prisma.projectMember.findMany({ where: { memberId: viewerId }, select: { projectId: true } })).map(p => p.projectId);
  if (projectIds.length === 0) return [];
  const spaces = await prisma.workspace.findMany({
    where: { archivedAt: null, projects: { some: { projectId: { in: projectIds } } } },
    select: { id: true, name: true, color: true, timezone: true },
  });

  const out: {
    workspaceId: string; workspaceName: string; color: string; shiftId: string;
    date: Ymd; startMin: number; endMin: number;
    member: { id: string; displayName: string; avatarUrl: string | null };
  }[] = [];
  for (const ws of spaces) {
    const dates = windowDates(todayIn(ws.timezone));
    const shifts = await prisma.labShift.findMany({
      where: {
        workspaceId: ws.id, buddyWanted: true, memberId: { not: viewerId },
        startsOn: { lte: toDbDate(dates[dates.length - 1]) }, endsOn: { gte: toDbDate(dates[0]) },
      },
      include: { skips: true, member: { select: { id: true, displayName: true, avatarUrl: true } } },
    });
    const memberOf = new Map(shifts.map(s => [s.id, s.member]));
    for (const o of expandShifts(shifts.map(toRow), shifts.flatMap(toSkips), dates)) {
      out.push({
        workspaceId: ws.id, workspaceName: ws.name, color: ws.color, shiftId: o.shiftId,
        date: o.date, startMin: o.startMin, endMin: o.endMin, member: memberOf.get(o.shiftId)!,
      });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.startMin - b.startMin).slice(0, 50);
}

// ── Notifications ────────────────────────────────────────────

async function notifyBuddyJoined(actorId: string, ws: WorkspaceDto, drafts: ShiftDraft[], today: Ymd) {
  const dates = windowDates(today);
  const mine = expandShifts(drafts.map((d, i) => ({ ...d, id: `new-${i}`, memberId: actorId })), [], dates);
  if (mine.length === 0) return;
  const others = await prisma.labShift.findMany({
    where: {
      workspaceId: ws.id, buddyWanted: true, memberId: { not: actorId },
      startsOn: { lte: toDbDate(dates[dates.length - 1]) }, endsOn: { gte: toDbDate(today) },
    },
    include: { skips: true },
  });
  const hits = overlapsFor(mine, expandShifts(others.map(toRow), others.flatMap(toSkips), dates));
  if (hits.size === 0) return;
  const name = await actorName(actorId);
  for (const [recipientId, list] of hits) {
    const message = `${name} will join you in ${ws.name} — ${describeOverlaps(list)}`;
    await createNotification({
      type: "LAB_BUDDY_JOINED", recipientId, actorId, message,
      metadata: { link: labLink(ws.id), workspaceId: ws.id },
      slackText: `🧪 ${message}`,
    });
  }
}

async function notifyBuddyWanted(actorId: string, ws: WorkspaceDto, drafts: ShiftDraft[]) {
  // Throttle: one per actor per space per 24 h. Reads in-app rows, so a
  // recipient set to Slack-only does not count — acceptable, it fails open.
  const recent = await prisma.notification.findFirst({
    where: {
      type: "LAB_BUDDY_WANTED", actorId, createdAt: { gte: new Date(Date.now() - DAY_MS) },
      metadata: { path: ["workspaceId"], equals: ws.id },
    },
    select: { id: true },
  });
  if (recent) return;
  const mine = await prisma.projectMember.findMany({
    where: { memberId: actorId, project: { workspaces: { some: { workspaceId: ws.id } } } },
    select: { projectId: true },
  });
  if (mine.length === 0) return;
  const teammates = await prisma.projectMember.findMany({
    where: { projectId: { in: mine.map(m => m.projectId) }, memberId: { not: actorId } },
    select: { memberId: true },
    distinct: ["memberId"],
  });
  const name = await actorName(actorId);
  const message = `${name} is looking for company in ${ws.name} — ${describeDrafts(drafts)}`;
  for (const t of teammates) {
    await createNotification({
      type: "LAB_BUDDY_WANTED", recipientId: t.memberId, actorId, projectId: mine[0].projectId, message,
      metadata: { link: labLink(ws.id), workspaceId: ws.id },
      slackText: `🧪 ${message}`,
    });
  }
}
