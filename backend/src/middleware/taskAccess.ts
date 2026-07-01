import type { Request, Response, NextFunction } from "express";
import { prisma } from "../db/prisma.js";

/**
 * Returns edit/delete/archive permissions for `memberId` against `taskId`.
 *
 * canEdit:    admin OR creator OR any assignee
 * canDelete:  admin OR creator only
 * canArchive: admin OR creator OR task is DONE (any authenticated member)
 */
export async function getTaskPermissions(
  memberId: string,
  taskId: string
): Promise<{ canEdit: boolean; canDelete: boolean; canArchive: boolean; isAdmin: boolean; isCreator: boolean }> {
  const [member, task] = await Promise.all([
    prisma.member.findUnique({
      where: { id: memberId },
      select: { isAdmin: true },
    }),
    prisma.task.findUnique({
      where: { id: taskId },
      select: { createdById: true, status: true, assignees: { select: { id: true } } },
    }),
  ]);

  if (!member || !task) {
    return { canEdit: false, canDelete: false, canArchive: false, isAdmin: false, isCreator: false };
  }

  const isAdmin   = member.isAdmin ?? false;
  const isCreator = task.createdById === memberId;
  const isAssignee = task.assignees.some((a) => a.id === memberId);

  return {
    canEdit:    isAdmin || isCreator || isAssignee,
    canDelete:  isAdmin || isCreator,
    canArchive: isAdmin || isCreator || task.status === "DONE",
    isAdmin,
    isCreator,
  };
}

export async function requireTaskEdit(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const { canEdit } = await getTaskPermissions(req.memberId!, req.params.id as string);
  if (!canEdit) {
    res.status(403).json({ error: "You do not have permission to modify this task" });
    return;
  }
  next();
}
