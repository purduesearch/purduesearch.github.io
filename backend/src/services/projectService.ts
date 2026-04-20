import { prisma } from "../db/prisma.js";
import type {
  Project,
  ProjectStatus,
  ProjectType,
  Prisma,
} from "@prisma/client";

// ── Types ────────────────────────────────────────────────────

interface CreateProjectInput {
  name: string;
  description?: string;
  slackChannel?: string;
  type: ProjectType;
  startDate?: Date;
  targetDate?: Date;
}

interface UpdateProjectInput {
  name?: string;
  description?: string;
  slackChannel?: string;
  status?: ProjectStatus;
  startDate?: Date;
  targetDate?: Date;
}

// ── Service ──────────────────────────────────────────────────

export async function listProjects(): Promise<Project[]> {
  return prisma.project.findMany({
    include: {
      members: { include: { member: true } },
      _count: { select: { tasks: true } },
    },
    orderBy: { updatedAt: "desc" },
  });
}

export async function getProject(id: string) {
  return prisma.project.findUnique({
    where: { id },
    include: {
      members: { include: { member: true } },
      tasks: {
        include: { assignee: true },
        orderBy: { createdAt: "desc" },
      },
      updates: {
        orderBy: { postedAt: "desc" },
        take: 20,
      },
    },
  });
}

export async function getProjectByChannel(channelId: string) {
  return prisma.project.findUnique({
    where: { slackChannel: channelId },
    include: {
      members: { include: { member: true } },
      tasks: { include: { assignee: true } },
    },
  });
}

export async function createProject(data: CreateProjectInput): Promise<Project> {
  return prisma.project.create({ data });
}

export async function updateProject(
  id: string,
  data: UpdateProjectInput
): Promise<Project> {
  return prisma.project.update({ where: { id }, data });
}

export async function addMemberToProject(
  projectId: string,
  memberId: string,
  projectRole = "Contributor"
) {
  return prisma.projectMember.upsert({
    where: {
      projectId_memberId: { projectId, memberId },
    },
    update: { projectRole },
    create: { projectId, memberId, projectRole },
  });
}

export async function removeMemberFromProject(
  projectId: string,
  memberId: string
) {
  return prisma.projectMember.delete({
    where: {
      projectId_memberId: { projectId, memberId },
    },
  });
}

export async function getProjectsWithTaskStats() {
  const projects = await prisma.project.findMany({
    include: {
      members: { include: { member: true } },
      tasks: { select: { status: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return projects.map((project) => {
    const totalTasks = project.tasks.length;
    const doneTasks = project.tasks.filter((t) => t.status === "DONE").length;
    return {
      ...project,
      totalTasks,
      doneTasks,
      completionPercent:
        totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0,
    };
  });
}

export async function findProjectByName(name: string) {
  return prisma.project.findFirst({
    where: {
      name: { contains: name, mode: "insensitive" as Prisma.QueryMode },
    },
    include: {
      members: { include: { member: true } },
      tasks: { include: { assignee: true } },
    },
  });
}
