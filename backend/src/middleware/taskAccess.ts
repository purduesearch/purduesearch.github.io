import type { Request, Response, NextFunction } from "express";
import { prisma } from "../db/prisma.js";
import { canEditProjectsBatch } from "../services/projectEditAccess.js";

type AssignmentTask = { id: string; projectId: string; createdById: string | null; archivedAt?: Date | null; assignees: { id: string }[] };

/** Board hints use the same task-level rule as mutation authorization. */
export function taskEditAllowed(memberId: string, task: Pick<AssignmentTask, "createdById" | "assignees">, isAdmin: boolean, isLead: boolean): boolean {
  return isAdmin || isLead || task.createdById === memberId || task.assignees.some(a => a.id === memberId);
}

export async function taskAssignmentPermissions<T extends AssignmentTask>(memberId: string, tasks: T[]) {
  const member = await prisma.member.findUnique({ where: { id: memberId }, select: { isAdmin: true } });
  const projects = [...new Set(tasks.map(t => t.projectId))];
  const leads = new Map(await Promise.all(projects.map(async id => [id, await isProjectLead(memberId, id)] as const)));
  const access = await canEditProjectsBatch(memberId, projects);
  return tasks.map(task => ({ ...task, canAssign: !!member && !!access.get(task.projectId) && !task.archivedAt && taskEditAllowed(memberId, task, member.isAdmin, leads.get(task.projectId) ?? false) }));
}

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
  const isManager = isAdmin || isLead;

  return {
    canEdit:    taskEditAllowed(memberId, task, isAdmin, isLead),
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
