/**
 * Lab check-in/out persistence, time splitting and sweeps.
 * Pure logic lives in labVisitCore.ts; timezone helpers in labScheduleCore.ts.
 *
 * Closing a visit turns its minutes into TimeLog rows split across the member's
 * IN_PROGRESS tasks (decision 6), through recordTimeLog so XP and challenge hooks
 * behave exactly like a manual log. Time from an auto-closed visit is logged
 * without XP.
 */
import type { LabVisit, Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { createNotification } from "./notificationCrud.js";
import { recordTimeLog } from "./timeLogService.js";
import { getWorkspace, type WorkspaceDto } from "./workspaceService.js";
import {
  expandShifts, localDateMinutes, toDbDate, fromDbDate, formatMinutes, type Ymd,
} from "./labScheduleCore.js";
import {
  visitMinutes, splitMinutes, pickSplitTasks, reminderAt, isReminderDue, isAutoCloseDue, localToInstant,
  MIN_VISIT_MINUTES, PENDING_TTL_DAYS,
} from "./labVisitCore.js";

export class LabVisitError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

type Source = "WEB" | "SLACK";
const DAY_MS = 86_400_000;
const UNALLOCATED_WINDOW_DAYS = 14;
const labLink = (workspaceId: string) => `/clubpm/calendar?lab=${workspaceId}`;
const memberSelect = { id: true, displayName: true, avatarUrl: true } as const;

export interface CloseResult {
  visit: LabVisit;
  discarded: boolean;
  allocations: { taskId: string; title: string; minutes: number }[];
  unallocatedMinutes: number;
  todoTasks: { id: string; title: string; projectName: string }[];
}

/** Local wall-clock label for an instant in the space's timezone, e.g. "4:30 PM". */
export function localClock(instant: Date, tz: string): string {
  return formatMinutes(localDateMinutes(instant, tz).minutes);
}

async function requireSpace(workspaceId: string): Promise<WorkspaceDto> {
  const ws = await getWorkspace(workspaceId);
  if (!ws) throw new LabVisitError(404, "Lab space not found");
  return ws;
}

/** The member's scheduled occurrences in a space on one local date. */
async function occurrencesOn(workspaceId: string, date: Ymd, memberId?: string) {
  const shifts = await prisma.labShift.findMany({
    where: {
      workspaceId, ...(memberId ? { memberId } : {}),
      startsOn: { lte: toDbDate(date) }, endsOn: { gte: toDbDate(date) },
    },
    include: { skips: true },
  });
  return expandShifts(
    shifts.map(s => ({
      id: s.id, memberId: s.memberId, weekday: s.weekday, startMin: s.startMin, endMin: s.endMin,
      startsOn: fromDbDate(s.startsOn), endsOn: fromDbDate(s.endsOn), buddyWanted: s.buddyWanted,
    })),
    shifts.flatMap(s => s.skips.map(k => ({ shiftId: s.id, date: fromDbDate(k.date) }))),
    [date],
  );
}

/** End of the scheduled shift that `now` falls inside, if any. */
async function expectedEndFor(memberId: string, ws: WorkspaceDto, now: Date): Promise<Date | null> {
  const local = localDateMinutes(now, ws.timezone);
  const occ = await occurrencesOn(ws.id, local.date, memberId);
  const hit = occ.find(o => o.startMin <= local.minutes && o.endMin > local.minutes);
  return hit ? localToInstant(local.date, hit.endMin, ws.timezone) : null;
}

const openTaskWhere = (memberId: string): Prisma.TaskWhereInput => ({
  archivedAt: null,
  assignees: { some: { id: memberId } },
  project: { trainingForMemberId: null },
});

async function todoTasksFor(memberId: string) {
  const rows = await prisma.task.findMany({
    where: { ...openTaskWhere(memberId), status: "TODO" },
    select: { id: true, title: true, project: { select: { name: true } } },
    orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
    take: 10,
  });
  return rows.map(t => ({ id: t.id, title: t.title, projectName: t.project.name }));
}

// ── Check in / out ───────────────────────────────────────────

export async function checkIn(memberId: string, workspaceId: string, source: Source, now = new Date()) {
  const ws = await requireSpace(workspaceId);
  if (ws.archived) throw new LabVisitError(400, "This space is archived.");

  // Decision 11: one open visit per member. Close the old one normally first.
  let closedPrevious: (CloseResult & { workspaceName: string }) | null = null;
  const open = await prisma.labVisit.findFirst({ where: { memberId, status: "OPEN" }, include: { workspace: { select: { name: true } } } });
  if (open) {
    closedPrevious = { ...(await closeVisit(open, now, source)), workspaceName: open.workspace.name };
  }

  const expectedEndAt = await expectedEndFor(memberId, ws, now);
  // Prisma has no partial unique index, so enforce "one OPEN" in a serializable transaction.
  const visit = await prisma.$transaction(async (tx) => {
    const existing = await tx.labVisit.findFirst({ where: { memberId, status: "OPEN" }, select: { id: true } });
    if (existing) throw new LabVisitError(409, "You're already checked in.");
    return tx.labVisit.create({ data: { memberId, workspaceId, source, checkedInAt: now, expectedEndAt } });
  }, { isolationLevel: "Serializable" });

  return { visit, workspace: ws, closedPrevious };
}

function validateEnd(visit: { checkedInAt: Date }, at: Date | undefined, now: Date): Date {
  if (!at) return now;
  if (Number.isNaN(at.getTime())) throw new LabVisitError(400, "That time isn't valid.");
  if (at.getTime() <= visit.checkedInAt.getTime()) throw new LabVisitError(400, "That time is before you checked in.");
  if (at.getTime() > now.getTime()) throw new LabVisitError(400, "That time is in the future.");
  return at;
}

export async function checkOut(memberId: string, opts: { at?: Date; source: Source }, now = new Date()): Promise<CloseResult & { workspace: WorkspaceDto }> {
  const open = await prisma.labVisit.findFirst({ where: { memberId, status: "OPEN" } });
  if (!open) throw new LabVisitError(404, "You're not checked in.");
  const end = validateEnd(open, opts.at, now);
  const ws = await requireSpace(open.workspaceId);
  return { ...(await closeVisit(open, end, opts.source)), workspace: ws };
}

/**
 * Close an OPEN or PENDING_CONFIRM visit at `end` and split its minutes.
 * The status flip is a conditional update, so two concurrent closes cannot both log time.
 */
export async function closeVisit(visit: LabVisit, end: Date, source: Source): Promise<CloseResult> {
  const minutes = visitMinutes(visit.checkedInAt, end);
  const discard = minutes < MIN_VISIT_MINUTES;
  const claimed = await prisma.labVisit.updateMany({
    where: { id: visit.id, status: visit.status },
    data: { status: discard ? "DISCARDED" : "CLOSED", checkedOutAt: end },
  });
  if (claimed.count === 0) throw new LabVisitError(409, "This visit was already closed.");
  const base = { discarded: discard, allocations: [], unallocatedMinutes: 0, todoTasks: [] };
  if (discard) return { ...base, visit: { ...visit, status: "DISCARDED", checkedOutAt: end } };

  const [tasks, links] = await Promise.all([
    prisma.task.findMany({
      where: { ...openTaskWhere(visit.memberId), status: "IN_PROGRESS" },
      select: { id: true, projectId: true, title: true },
    }),
    prisma.workspaceProject.findMany({ where: { workspaceId: visit.workspaceId }, select: { projectId: true } }),
  ]);
  const splits = splitMinutes(minutes, pickSplitTasks(tasks, links.map(l => l.projectId)));
  const titleOf = new Map(tasks.map(t => [t.id, t.title]));

  if (splits.length === 0) {
    const updated = await prisma.labVisit.update({ where: { id: visit.id }, data: { unallocatedMinutes: minutes } });
    return { ...base, visit: updated, unallocatedMinutes: minutes, todoTasks: await todoTasksFor(visit.memberId) };
  }

  const ws = await prisma.workspace.findUnique({ where: { id: visit.workspaceId }, select: { name: true } });
  for (const s of splits) {
    await recordTimeLog({
      taskId: s.taskId, memberId: visit.memberId, minutes: s.minutes, source,
      note: `Lab: ${ws?.name ?? "check-in"}`, labVisitId: visit.id, grantXp: !visit.autoClosed,
    });
  }
  return {
    ...base,
    visit: { ...visit, status: "CLOSED", checkedOutAt: end },
    allocations: splits.map(s => ({ taskId: s.taskId, title: titleOf.get(s.taskId) ?? "Task", minutes: s.minutes })),
  };
}

/** Give a closed visit's unallocated minutes to one of the member's tasks. */
export async function allocateUnallocated(memberId: string, visitId: string, taskId: string, source: Source = "WEB") {
  const visit = await prisma.labVisit.findUnique({ where: { id: visitId } });
  if (!visit || visit.memberId !== memberId) throw new LabVisitError(404, "Visit not found");
  if (visit.status !== "CLOSED" || visit.unallocatedMinutes <= 0) throw new LabVisitError(400, "This visit has no time left to log.");
  const task = await prisma.task.findFirst({ where: { id: taskId, ...openTaskWhere(memberId) }, select: { id: true, title: true } });
  if (!task) throw new LabVisitError(403, "You can only log lab time to your own tasks.");

  const minutes = visit.unallocatedMinutes;
  const claimed = await prisma.labVisit.updateMany({
    where: { id: visitId, unallocatedMinutes: minutes },
    data: { unallocatedMinutes: 0 },
  });
  if (claimed.count === 0) throw new LabVisitError(409, "That time was already logged.");
  const ws = await prisma.workspace.findUnique({ where: { id: visit.workspaceId }, select: { name: true } });
  await recordTimeLog({
    taskId, memberId, minutes, source, note: `Lab: ${ws?.name ?? "check-in"}`,
    labVisitId: visitId, grantXp: !visit.autoClosed,
  });
  return { visitId, taskId, title: task.title, minutes };
}

/** PENDING_CONFIRM → CLOSED. Auto-closed time earns no XP (decision 5). */
export async function confirmPending(memberId: string, opts: { at?: Date; source: Source }, now = new Date()) {
  const pending = await prisma.labVisit.findFirst({
    where: { memberId, status: "PENDING_CONFIRM" },
    orderBy: { checkedInAt: "desc" },
  });
  if (!pending) throw new LabVisitError(404, "You have no lab visit waiting for confirmation.");
  const end = opts.at ? validateEnd(pending, opts.at, now) : (pending.checkedOutAt ?? reminderAt(pending));
  const ws = await requireSpace(pending.workspaceId);
  return { ...(await closeVisit(pending, end, opts.source)), workspace: ws };
}

// ── Reads ────────────────────────────────────────────────────

const visitInclude = { workspace: { select: { id: true, name: true, color: true, timezone: true } } } as const;

export async function getMyVisits(memberId: string, now = new Date()) {
  const [open, pending, unallocated] = await Promise.all([
    prisma.labVisit.findFirst({ where: { memberId, status: "OPEN" }, include: visitInclude }),
    prisma.labVisit.findMany({ where: { memberId, status: "PENDING_CONFIRM" }, include: visitInclude, orderBy: { checkedInAt: "desc" } }),
    prisma.labVisit.findMany({
      where: {
        memberId, status: "CLOSED", unallocatedMinutes: { gt: 0 },
        checkedInAt: { gte: new Date(now.getTime() - UNALLOCATED_WINDOW_DAYS * DAY_MS) },
      },
      include: visitInclude,
      orderBy: { checkedInAt: "desc" },
    }),
  ]);
  return { open, pending, unallocated, todoTasks: unallocated.length ? await todoTasksFor(memberId) : [] };
}

/** Per space: who is checked in, and who is scheduled right now but not checked in. */
export async function getPresent(filter: { projectId?: string; workspaceId?: string }, now = new Date()) {
  const spaces = await prisma.workspace.findMany({
    where: {
      archivedAt: null,
      ...(filter.workspaceId ? { id: filter.workspaceId } : {}),
      ...(filter.projectId ? { projects: { some: { projectId: filter.projectId } } } : {}),
    },
    select: { id: true, name: true, color: true, timezone: true },
    orderBy: { name: "asc" },
  });
  return Promise.all(spaces.map(async (ws) => {
    const local = localDateMinutes(now, ws.timezone);
    const [visits, occ] = await Promise.all([
      prisma.labVisit.findMany({
        where: { workspaceId: ws.id, status: "OPEN" },
        include: { member: { select: memberSelect } },
        orderBy: { checkedInAt: "asc" },
      }),
      occurrencesOn(ws.id, local.date),
    ]);
    const inIds = new Set(visits.map(v => v.memberId));
    const scheduledNow = occ.filter(o => o.startMin <= local.minutes && o.endMin > local.minutes && !inIds.has(o.memberId));
    const people = await prisma.member.findMany({
      where: { id: { in: [...new Set(scheduledNow.map(o => o.memberId))] } },
      select: memberSelect,
    });
    const byId = new Map(people.map(p => [p.id, p]));
    return {
      workspace: { id: ws.id, name: ws.name, color: ws.color },
      checkedIn: visits.map(v => ({ member: v.member, checkedInAt: v.checkedInAt })),
      scheduled: scheduledNow
        .filter(o => byId.has(o.memberId))
        .map(o => ({ member: byId.get(o.memberId)!, startMin: o.startMin, endMin: o.endMin })),
    };
  }));
}

// ── Sweeps (driven by slack/scheduler.ts) ────────────────────

/** Decision 8: one checkout reminder per overdue OPEN visit. */
export async function sendDueReminders(now = new Date()): Promise<number> {
  const open = await prisma.labVisit.findMany({
    where: { status: "OPEN", reminderSentAt: null },
    include: visitInclude,
  });
  let sent = 0;
  for (const v of open) {
    if (!isReminderDue(v, now)) continue;
    const claimed = await prisma.labVisit.updateMany({ where: { id: v.id, reminderSentAt: null }, data: { reminderSentAt: now } });
    if (claimed.count === 0) continue;
    const message = `Still in ${v.workspace.name}? You checked in at ${localClock(v.checkedInAt, v.workspace.timezone)}. Check out with /lab out (or /lab out 4:30pm).`;
    await createNotification({
      type: "LAB_CHECKOUT_REMINDER", recipientId: v.memberId, message,
      metadata: { link: labLink(v.workspaceId), workspaceId: v.workspaceId, visitId: v.id },
      slackText: `🧪 ${message}`,
    }).catch(err => console.error("[labVisit] reminder failed:", err));
    sent++;
  }
  return sent;
}

/** Decision 9: after local midnight, close forgotten visits at their reminder time, pending confirmation. */
export async function autoCloseStale(now = new Date()): Promise<number> {
  const open = await prisma.labVisit.findMany({ where: { status: "OPEN" }, include: visitInclude });
  let closed = 0;
  for (const v of open) {
    if (!isAutoCloseDue(v, now, v.workspace.timezone)) continue;
    const end = new Date(Math.min(reminderAt(v).getTime(), now.getTime()));
    const claimed = await prisma.labVisit.updateMany({
      where: { id: v.id, status: "OPEN" },
      data: { status: "PENDING_CONFIRM", checkedOutAt: end, autoClosed: true },
    });
    if (claimed.count === 0) continue;
    const message = `You didn't check out of ${v.workspace.name}, so we closed your visit at ${localClock(end, v.workspace.timezone)}. `
      + `Confirm it with /lab confirm, or /lab confirm 4:30pm to set the real time — or use the banner in Constellation.`;
    await createNotification({
      type: "LAB_VISIT_PENDING", recipientId: v.memberId, message,
      metadata: { link: labLink(v.workspaceId), workspaceId: v.workspaceId, visitId: v.id },
      slackText: `🧪 ${message}`,
    }).catch(err => console.error("[labVisit] pending notice failed:", err));
    closed++;
  }
  return closed;
}

/** Unconfirmed auto-closed visits older than 7 days are dropped (no time logged). */
export async function discardExpiredPending(now = new Date()): Promise<number> {
  const res = await prisma.labVisit.updateMany({
    where: { status: "PENDING_CONFIRM", checkedInAt: { lt: new Date(now.getTime() - PENDING_TTL_DAYS * DAY_MS) } },
    data: { status: "DISCARDED" },
  });
  return res.count;
}
