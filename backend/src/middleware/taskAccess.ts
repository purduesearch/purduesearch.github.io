import type { Request, Response, NextFunction } from "express";
import { prisma } from "../db/prisma.js";

/**
 * Returns edit/delete/archive permissions for `memberId` against `taskId`.
 *
 * A project lead (ProjectMember.isLead) has admin powers over every task in
 * that project, and only that project.
 *
 * canEdit:    admin OR lead OR creator OR any assignee
 * canDelete:  admin OR lead OR creator only
 * canArchive: admin OR lead OR creator OR task is DONE (any authenticated member)
 */
export async function getTaskPermissions(
  memberId: string,
  taskId: string
): Promise<{ canEdit: boolean; canDelete: boolean; canArchive: boolean; isAdmin: boolean; isCreator: boolean; isLead: boolean }> {
  const [member, task] = await Promise.all([
    prisma.member.findUnique({
      where: { id: memberId },
      select: { isAdmin: true },
    }),
    prisma.task.findUnique({
      where: { id: taskId },
      select: { projectId: true, createdById: true, status: true, assignees: { select: { id: true } } },
    }),
  ]);

  if (!member || !task) {
    return { canEdit: false, canDelete: false, canArchive: false, isAdmin: false, isCreator: false, isLead: false };
  }

  const isAdmin   = member.isAdmin ?? false;
  const isLead    = await isProjectLead(memberId, task.projectId);
  const isCreator = task.createdById === memberId;
  const isAssignee = task.assignees.some((a) => a.id === memberId);
  const isManager = isAdmin || isLead;

  return {
    canEdit:    isManager || isCreator || isAssignee,
    canDelete:  isManager || isCreator,
    canArchive: isManager || isCreator || task.status === "DONE",
    isAdmin,
    isCreator,
    isLead,
  };
}

/**
 * True when `memberId` is flagged as a lead of `projectId`, or of its parent while the
 * sub-project's rollup.parentMembersCanEdit is on.
 */
export async function isProjectLead(memberId: string, projectId: string | null | undefined): Promise<boolean> {
  if (!projectId) return false;
  const row = await prisma.projectMember.findUnique({
    where: { projectId_memberId: { projectId, memberId } },
    select: { isLead: true },
  });
  if (row?.isLead) return true;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { parentId: true, rollup: { select: { parentMembersCanEdit: true } } },
  });
  if (!project?.parentId || !project.rollup?.parentMembersCanEdit) return false;
  const parentRow = await prisma.projectMember.findUnique({
    where: { projectId_memberId: { projectId: project.parentId, memberId } },
    select: { isLead: true },
  });
  return parentRow?.isLead ?? false;
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
