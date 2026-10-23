import { prisma } from "../db/prisma.js";
import { LIMITS } from "../presence/boardPresenceCore.js";

/**
 * Database mirror of the presence relay's card locks. The relay decides; this
 * table only lets other code paths (and other processes) see the decision.
 * Every function swallows its own errors: a mirror failure must never break
 * dragging or writing.
 */
const expiry = () => new Date(Date.now() + LIMITS.lockTtlMs);
const warn = (what: string) => (err: unknown) => console.warn(`[boardLock] ${what} failed:`, err);

export function mirrorAcquire(taskIds: string[], memberId: string): void {
  if (!taskIds.length) return;
  const expiresAt = expiry();
  void prisma.$transaction(taskIds.map(taskId => prisma.boardLock.upsert({
    where: { taskId }, create: { taskId, memberId, expiresAt }, update: { memberId, expiresAt },
  }))).catch(warn("acquire"));
}

export function mirrorRelease(taskIds: string[]): void {
  if (!taskIds.length) return;
  void prisma.boardLock.deleteMany({ where: { taskId: { in: taskIds } } }).catch(warn("release"));
}

export function mirrorRenew(taskIds: string[]): void {
  if (!taskIds.length) return;
  void prisma.boardLock.updateMany({ where: { taskId: { in: taskIds } }, data: { expiresAt: expiry() } }).catch(warn("renew"));
}

/** Unexpired mirrored locks on tasks inside `projectIds` (used when a family is loaded after a restart). */
export async function mirroredLocksFor(projectIds: string[]): Promise<{ taskId: string; memberId: string }[]> {
  try {
    const rows = await prisma.boardLock.findMany({ where: { expiresAt: { gt: new Date() } } });
    if (!rows.length) return [];
    const inFamily = await prisma.task.findMany({
      where: { id: { in: rows.map(r => r.taskId) }, projectId: { in: projectIds } },
      select: { id: true },
    });
    const ok = new Set(inFamily.map(t => t.id));
    return rows.filter(r => ok.has(r.taskId)).map(r => ({ taskId: r.taskId, memberId: r.memberId }));
  } catch (err) {
    warn("load")(err);
    return [];
  }
}

/** Write backstop: unexpired locks on `taskIds` held by anyone other than `actorId`. */
export async function lockedByOthers(taskIds: string[], actorId: string): Promise<{ taskId: string; memberId: string }[]> {
  if (!taskIds.length) return [];
  try {
    return await prisma.boardLock.findMany({
      where: { taskId: { in: taskIds }, expiresAt: { gt: new Date() }, memberId: { not: actorId } },
      select: { taskId: true, memberId: true },
    });
  } catch (err) {
    warn("check")(err);
    return []; // fail open: the mirror is advisory
  }
}
