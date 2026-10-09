import { prisma } from "../db/prisma.js";
import { getTaskPermissions } from "../middleware/taskAccess.js";
import { createNotification } from "./notificationCrud.js";
import { queueDm } from "./dmBatcher.js";
import { logAuditEvent } from "./activityService.js";
import { emitTaskChanged } from "./taskChangeBus.js";
import { TaskMutationError, type MutationSource } from "./taskMutationService.js";

export interface CreateBlockerInput { label: string; color?: string; assigneeId?: string | null; }

// Preserve the REST policy: creation requires an authenticated member only.
export async function createBlockerAsMember(actorId: string, projectId: string, input: CreateBlockerInput, source: MutationSource) {
  const { label, color, assigneeId } = input;
  if (!label) {
    throw new TaskMutationError(400, "label is required");
  }
  const blocker = await prisma.blocker.create({
    data: { projectId, label, color: color ?? null, assigneeId: assigneeId ?? null },
  });

  if (blocker.assigneeId) {
    await notifyBlockerAssignee(blocker.id, blocker.assigneeId, blocker.label, actorId, source);
  }

  return blocker;
}

export async function attachBlockerAsMember(actorId: string, taskId: string, input: { blockerId: string; reason?: string | null }, source: MutationSource) {
  const { canEdit } = await getTaskPermissions(actorId, taskId);
  if (!canEdit) throw new TaskMutationError(403, "You do not have permission to modify this task");
  const { blockerId, reason } = input;
  if (!blockerId) {
    throw new TaskMutationError(400, "blockerId is required");
  }

  const blocker = await prisma.blocker.findUnique({ where: { id: blockerId } });
  if (!blocker || blocker.resolvedAt) {
    throw new TaskMutationError(400, "Blocker not found or already resolved");
  }

  await prisma.taskBlocker.upsert({
    where: { taskId_blockerId: { taskId, blockerId } },
    create: { taskId, blockerId, reason: reason ?? null },
    update: { reason: reason ?? null },
  });
  emitTaskChanged(taskId);

  // completedAt: null — leaving DONE clears it; a no-op when already null.
  await prisma.task.update({ where: { id: taskId }, data: { status: "BLOCKED", completedAt: null } });
  emitTaskChanged(taskId);

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { blockers: { include: { blocker: true } } },
  });

  logAuditEvent({
    taskId, projectId: blocker.projectId, memberId: actorId, source: source === "AI" ? "WEB" : source,
    eventType: "TASK_BLOCKER_ATTACHED",
    payload: { taskTitle: (task as any)?.title, blockerLabel: blocker.label, reason: reason ?? null },
  }).catch(console.error);

  return task;
}

export async function notifyBlockerAssignee(
  blockerId: string,
  assigneeId: string,
  label: string,
  actorId: string | null,
  source: MutationSource = "WEB"
): Promise<void> {
  const blocker = await prisma.blocker.findUnique({
    where: { id: blockerId },
    select: { projectId: true },
  });
  const assignee = await prisma.member.findUnique({
    where: { id: assigneeId },
    select: { slackId: true },
  });
  if (!blocker || !assignee) return;

  const message = `You're responsible for resolving blocker '${label}'`;

  await createNotification({
    type: "SYSTEM",
    recipientId: assigneeId,
    actorId: actorId ?? undefined,
    projectId: blocker.projectId,
    message,
  });

  if (assignee.slackId) queueDm(assignee.slackId, message);

  await logAuditEvent({
    projectId: blocker.projectId,
    memberId: actorId,
    source: source === "AI" ? "WEB" : source,
    eventType: "BLOCKER_ASSIGNED",
    payload: { blockerId, assigneeId, label },
  });
}
