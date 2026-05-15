import { prisma } from "../db/prisma.js";
import type {
  Project,
  ProjectStatus,
  ProjectType,
  Prisma,
} from "@prisma/client";
import { boltApp } from "../slack/bolt.js";

// ── Types ────────────────────────────────────────────────────

interface CreateProjectInput {
  name: string;
  description?: string;
  driveLink?: string;
  slackChannel?: string;
  type: ProjectType;
  startDate?: Date;
  targetDate?: Date;
}

interface UpdateProjectInput {
  name?: string;
  description?: string;
  driveLink?: string;
  slackChannel?: string;
  slackChannelId?: string | null;
  slackChannelName?: string | null;
  status?: ProjectStatus;
  startDate?: Date;
  targetDate?: Date;
}

// ── Channel membership cache (60s TTL) ──────────────────────

const channelMembersCache = new Map<string, { ids: string[]; ts: number }>();

export async function getChannelMemberSlackIds(channelId: string): Promise<string[]> {
  const cached = channelMembersCache.get(channelId);
  if (cached && Date.now() - cached.ts < 60_000) return cached.ids;

  const ids: string[] = [];
  let cursor: string | undefined;
  do {
    const result = await boltApp.client.conversations.members({
      channel: channelId,
      limit: 200,
      cursor,
    });
    ids.push(...(result.members ?? []));
    cursor = result.response_metadata?.next_cursor || undefined;
  } while (cursor);

  channelMembersCache.set(channelId, { ids, ts: Date.now() });
  return ids;
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
        where: { parentTaskId: null }, // top-level tasks only
        include: {
          assignees: true,
          subtasks: { include: { assignees: true }, orderBy: { createdAt: "asc" } },
          blockedBy: { include: { blockingTask: { select: { id: true, title: true, status: true } } } },
          blocks:    { include: { blockedTask:  { select: { id: true, title: true, status: true } } } },
          milestone: true,
        },
        orderBy: { createdAt: "desc" },
      },
      milestones: {
        select: { id: true, title: true, dueDate: true, status: true },
        orderBy: { dueDate: "asc" },
      },
      updates: {
        orderBy: { postedAt: "desc" },
        take: 20,
      },
    },
  });
}

export async function getProjectsForChannel(channelId: string) {
  // Primary: look up via notification targets
  const targets = await prisma.projectNotificationTarget.findMany({
    where: { slackChannelId: channelId },
    include: {
      project: {
        include: {
          members: { include: { member: true } },
          tasks: { include: { assignees: true } },
        },
      },
    },
  });

  if (targets.length > 0) {
    return targets.map(t => t.project);
  }

  // Fallback: direct slackChannelId link or legacy slackChannel field
  const legacy = await prisma.project.findFirst({
    where: {
      OR: [
        { slackChannelId: channelId },
        { slackChannel: channelId },
      ],
    },
    include: {
      members: { include: { member: true } },
      tasks: { include: { assignees: true } },
    },
  });
  return legacy ? [legacy] : [];
}

export async function getProjectByChannel(channelId: string) {
  const projects = await getProjectsForChannel(channelId);
  return projects[0] ?? null;
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
      tasks: { include: { assignees: true } },
    },
  });
}
