import { prisma } from "../db/prisma.js";

/**
 * Returns edit/delete permissions for `memberId` against `taskId`.
 *
 * canEdit:   admin OR creator OR any assignee
 * canDelete: admin OR creator only
 */
export async function getTaskPermissions(
  memberId: string,
  taskId: string
): Promise<{ canEdit: boolean; canDelete: boolean }> {
  const [member, task] = await Promise.all([
    prisma.member.findUnique({
      where: { id: memberId },
      select: { isAdmin: true },
    }),
    prisma.task.findUnique({
      where: { id: taskId },
      select: { createdById: true, assignees: { select: { id: true } } },
    }),
  ]);

  if (!member || !task) return { canEdit: false, canDelete: false };

  const isAdmin   = member.isAdmin ?? false;
  const isCreator = task.createdById === memberId;
  const isAssignee = task.assignees.some((a) => a.id === memberId);

  return {
    canEdit:   isAdmin || isCreator || isAssignee,
    canDelete: isAdmin || isCreator,
  };
}
