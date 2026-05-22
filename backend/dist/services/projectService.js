import { prisma } from "../db/prisma.js";
import { boltApp } from "../slack/bolt.js";
import { resolveSlackMember } from "./memberService.js";
// ── Channel membership cache (60s TTL) ──────────────────────
const channelMembersCache = new Map();
export async function getChannelMemberSlackIds(channelId) {
    const cached = channelMembersCache.get(channelId);
    if (cached && Date.now() - cached.ts < 60_000)
        return cached.ids;
    const ids = [];
    let cursor;
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
export async function listProjects() {
    return prisma.project.findMany({
        include: {
            members: { include: { member: true } },
            _count: { select: { tasks: true } },
        },
        orderBy: { updatedAt: "desc" },
    });
}
export async function getProject(id) {
    return prisma.project.findUnique({
        where: { id },
        include: {
            members: { include: { member: true } },
            tasks: {
                where: { parentTaskId: null }, // top-level tasks only
                include: {
                    assignees: true,
                    tags: true,
                    subtasks: { include: { assignees: true }, orderBy: { createdAt: "asc" } },
                    blockedBy: { include: { blockingTask: { select: { id: true, title: true, status: true } } } },
                    blocks: { include: { blockedTask: { select: { id: true, title: true, status: true } } } },
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
export async function getProjectsForChannel(channelId) {
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
export async function getProjectByChannel(channelId) {
    const projects = await getProjectsForChannel(channelId);
    return projects[0] ?? null;
}
export async function createProject(data) {
    return prisma.project.create({ data });
}
export async function updateProject(id, data) {
    return prisma.project.update({ where: { id }, data });
}
export async function addMemberToProject(projectId, memberId, projectRole = "Contributor") {
    return prisma.projectMember.upsert({
        where: {
            projectId_memberId: { projectId, memberId },
        },
        update: { projectRole },
        create: { projectId, memberId, projectRole },
    });
}
// ── Sync project membership from linked Slack channel ────────
//
// For each user in the project's linked Slack channel, ensure a Member row
// exists (refreshing isBot via users.info) and a ProjectMember row exists
// for every non-bot. Also removes any ProjectMember whose Member is a bot
// (cleanup for rows added before the isBot flag existed).
//
// Per-project debounce avoids re-syncing on every page load: defaults to 60s,
// matching the existing channelMembersCache TTL.
const lastSyncByProject = new Map();
export async function syncProjectMembersFromChannel(projectId, options = {}) {
    const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { slackChannelId: true },
    });
    if (!project?.slackChannelId)
        return;
    if (!options.force) {
        const last = lastSyncByProject.get(projectId) ?? 0;
        if (Date.now() - last < 60_000)
            return;
    }
    lastSyncByProject.set(projectId, Date.now());
    let slackIds;
    try {
        slackIds = await getChannelMemberSlackIds(project.slackChannelId);
    }
    catch (err) {
        // Bot may not be in the channel yet, or scope missing — degrade silently.
        console.warn(`[syncProjectMembersFromChannel] could not list members for ${project.slackChannelId}:`, err.message);
        return;
    }
    for (const slackId of slackIds) {
        try {
            const member = await resolveSlackMember(slackId, boltApp.client);
            if (member.isBot)
                continue;
            await addMemberToProject(projectId, member.id);
        }
        catch (err) {
            console.warn(`[syncProjectMembersFromChannel] failed for slackId=${slackId}:`, err.message);
        }
    }
    // Cleanup: remove any ProjectMember that is a bot.
    await prisma.projectMember.deleteMany({
        where: { projectId, member: { isBot: true } },
    });
}
export async function removeMemberFromProject(projectId, memberId) {
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
            completionPercent: totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0,
        };
    });
}
export async function findProjectByName(name) {
    return prisma.project.findFirst({
        where: {
            name: { contains: name, mode: "insensitive" },
        },
        include: {
            members: { include: { member: true } },
            tasks: { include: { assignees: true } },
        },
    });
}
//# sourceMappingURL=projectService.js.map