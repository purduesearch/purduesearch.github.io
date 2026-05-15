import type { App } from "@slack/bolt";
import type { Task, Member, Project, NotificationTargetType } from "@prisma/client";
import {
  buildWeeklyDigest,
  buildProjectStatusCard,
  buildTaskReminderCard,
  buildWeekAheadCard,
  buildBatchedReminderDigest,
  buildEscalationCard,
  buildTaskCard,
  buildStandupDmPrompt,
  buildStaleTasksCard,
  buildMilestoneCelebrationCard,
  buildMilestoneAlertCard,
} from "../utils/blockKit.js";
import { prisma } from "../db/prisma.js";
import {
  getOverdueTasks,
  getTasksDueToday,
  getTasksDueThisWeek,
} from "./taskService.js";

type TaskWithRelations = Task & {
  assignees: Member[];
  project: Project;
};

// ── Notification Target CRUD ─────────────────────────────────

export async function addNotificationTarget(
  projectId: string,
  type: NotificationTargetType,
  slackChannelId: string,
  eventTypes: string[] = []
) {
  return prisma.projectNotificationTarget.upsert({
    where: { projectId_slackChannelId: { projectId, slackChannelId } },
    update: { type, eventTypes },
    create: { projectId, type, slackChannelId, eventTypes },
  });
}

export async function removeNotificationTarget(id: string) {
  return prisma.projectNotificationTarget.delete({ where: { id } });
}

export async function getNotificationTargetsForProject(projectId: string) {
  return prisma.projectNotificationTarget.findMany({
    where: { projectId },
    orderBy: { createdAt: "asc" },
  });
}

// ── Notification Service ─────────────────────────────────────

export async function sendWeeklyDigest(
  app: App,
  member: Member
): Promise<void> {
  if (!member.notificationPrefs.includes("weekly_digest")) return;
  const tasks = (await getTasksDueThisWeek(member.id)) as TaskWithRelations[];
  if (tasks.length === 0) return;

  const blocks = buildWeeklyDigest(member, tasks);

  await app.client.chat.postMessage({
    channel: member.slackId,
    text: `📋 Your tasks this week (${tasks.length})`,
    blocks,
  });
}

export async function sendDueDateReminder(
  app: App,
  task: TaskWithRelations
): Promise<void> {
  if (!task.assignees || task.assignees.length === 0) return;

  const blocks = buildTaskReminderCard(task);

  for (const assignee of task.assignees) {
    await app.client.chat.postMessage({
      channel: assignee.slackId,
      text: `⏰ Reminder: "${task.title}" is due ${task.dueDate ? (task.dueDate <= new Date() ? "overdue!" : "today!") : "soon!"}`,
      blocks,
    });
  }
}

async function getChannelsForProject(projectId: string): Promise<string[]> {
  const targets = await prisma.projectNotificationTarget.findMany({
    where: { projectId, type: "CHANNEL" },
    select: { slackChannelId: true },
  });
  const fromTargets = targets.map(t => t.slackChannelId);

  // Also include legacy slackChannel field if not already covered
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { slackChannel: true },
  });
  if (project?.slackChannel && !fromTargets.includes(project.slackChannel)) {
    fromTargets.push(project.slackChannel);
  }
  return fromTargets;
}

export async function postProjectHealthSummary(
  app: App,
  project: Project & { tasks: (Task & { assignees: Member[] })[] }
): Promise<void> {
  const channels = await getChannelsForProject(project.id);
  if (channels.length === 0) return;

  const blocks = buildProjectStatusCard(project, project.tasks);

  await Promise.all(channels.map(channel =>
    app.client.chat.postMessage({
      channel,
      text: `📊 Weekly health summary for ${project.name}`,
      blocks,
    })
  ));
}

export async function postWeekAheadSummary(
  app: App,
  project: Project & { tasks: (Task & { assignees: Member[] })[] }
): Promise<void> {
  const channels = await getChannelsForProject(project.id);
  if (channels.length === 0) return;

  const now = new Date();
  const endOfWeek = new Date();
  endOfWeek.setDate(now.getDate() + 7);

  const upcomingTasks = project.tasks.filter(
    (t) =>
      t.status !== "DONE" &&
      t.dueDate &&
      t.dueDate >= now &&
      t.dueDate <= endOfWeek
  );

  if (upcomingTasks.length === 0) return;

  const blocks = buildWeekAheadCard(project, upcomingTasks);

  await Promise.all(channels.map(channel =>
    app.client.chat.postMessage({
      channel,
      text: `📅 Week ahead for ${project.name}: ${upcomingTasks.length} tasks`,
      blocks,
    })
  ));
}

// ── Batch Operations (called by scheduler) ───────────────────

export async function sendAllDueDateReminders(app: App): Promise<void> {
  const overdueTasks = (await getOverdueTasks()) as TaskWithRelations[];
  const dueTodayTasks = (await getTasksDueToday()) as TaskWithRelations[];

  // Group tasks per assignee
  const byMember = new Map<string, { member: Member; overdue: TaskWithRelations[]; dueToday: TaskWithRelations[] }>();

  for (const task of overdueTasks) {
    for (const assignee of task.assignees) {
      if (!byMember.has(assignee.id)) {
        byMember.set(assignee.id, { member: assignee, overdue: [], dueToday: [] });
      }
      byMember.get(assignee.id)!.overdue.push(task);
    }
  }

  for (const task of dueTodayTasks) {
    for (const assignee of task.assignees) {
      if (!byMember.has(assignee.id)) {
        byMember.set(assignee.id, { member: assignee, overdue: [], dueToday: [] });
      }
      byMember.get(assignee.id)!.dueToday.push(task);
    }
  }

  for (const { member, overdue, dueToday } of byMember.values()) {
    try {
      // Respect notification preferences
      const fullMember = await prisma.member.findUnique({ where: { id: member.id } });
      if (!fullMember?.notificationPrefs.includes("daily_reminders")) continue;

      const blocks = buildBatchedReminderDigest(member, overdue, dueToday);
      await app.client.chat.postMessage({
        channel: member.slackId,
        text: `⏰ You have ${overdue.length + dueToday.length} task(s) needing attention`,
        blocks,
      });
    } catch (error) {
      console.error(`Failed to send batched reminder to ${member.displayName}:`, error);
    }
  }
}

export async function sendAllWeeklyDigests(app: App): Promise<void> {
  const members = await prisma.member.findMany();
  for (const member of members) {
    try {
      await sendWeeklyDigest(app, member);
    } catch (error) {
      console.error(
        `Failed to send digest to ${member.displayName}:`,
        error
      );
    }
  }
}

export async function postAllProjectHealthSummaries(app: App): Promise<void> {
  // Include projects with notification targets OR legacy slackChannel
  const targetProjectIds = await prisma.projectNotificationTarget.findMany({
    select: { projectId: true },
    distinct: ["projectId"],
  });
  const projects = await prisma.project.findMany({
    where: {
      status: "ACTIVE",
      OR: [
        { id: { in: targetProjectIds.map(t => t.projectId) } },
        { slackChannel: { not: null } },
      ],
    },
    include: { tasks: { include: { assignees: true } } },
  });

  for (const project of projects) {
    try {
      await postProjectHealthSummary(app, project);
    } catch (error) {
      console.error(`Failed to post health summary for ${project.name}:`, error);
    }
  }
}

export async function postAllWeekAheadSummaries(app: App): Promise<void> {
  const targetProjectIds = await prisma.projectNotificationTarget.findMany({
    select: { projectId: true },
    distinct: ["projectId"],
  });
  const projects = await prisma.project.findMany({
    where: {
      status: "ACTIVE",
      OR: [
        { id: { in: targetProjectIds.map(t => t.projectId) } },
        { slackChannel: { not: null } },
      ],
    },
    include: { tasks: { include: { assignees: true } } },
  });

  for (const project of projects) {
    try {
      await postWeekAheadSummary(app, project);
    } catch (error) {
      console.error(`Failed to post week-ahead for ${project.name}:`, error);
    }
  }
}

export async function postEscalationNotice(
  app: App,
  task: TaskWithRelations
): Promise<void> {
  const channels = await getChannelsForProject(task.projectId);
  if (channels.length === 0) return;

  const blocks = buildEscalationCard(task);

  await Promise.all(
    channels.map(channel =>
      app.client.chat.postMessage({
        channel,
        text: `🚨 Escalation: "${task.title}" is overdue and needs attention`,
        blocks,
      })
    )
  );

  // Mark as escalated so we don't spam the channel
  await prisma.task.update({
    where: { id: task.id },
    data: { escalatedAt: new Date() },
  });
}

export async function sendAllEscalations(app: App): Promise<void> {
  const threeDaysAgo = new Date(Date.now() - 3 * 86_400_000);
  const oneDayAgo = new Date(Date.now() - 86_400_000);

  // Tasks overdue by 3+ days, either never escalated or last escalated >24h ago
  const tasks = (await prisma.task.findMany({
    where: {
      status: { not: "DONE" },
      dueDate: { lt: threeDaysAgo },
      OR: [
        { escalatedAt: null },
        { escalatedAt: { lt: oneDayAgo } },
      ],
    },
    include: { assignees: true, project: true },
  })) as TaskWithRelations[];

  for (const task of tasks) {
    try {
      await postEscalationNotice(app, task);
    } catch (error) {
      console.error(`Failed to escalate task ${task.id}:`, error);
    }
  }
}

// ── Threaded Task Notifications ───────────────────────────────

export async function postTaskAnnouncement(
  app: App,
  task: TaskWithRelations,
  channelId: string
): Promise<void> {
  try {
    const result = await app.client.chat.postMessage({
      channel: channelId,
      blocks: buildTaskCard(task, task.project),
      text: `📋 New task: ${task.title}`,
    });
    if (result.ts) {
      await prisma.task.update({
        where: { id: task.id },
        data: { slackMsgTs: result.ts as string },
      });
    }
  } catch (error) {
    console.error(`postTaskAnnouncement failed for task ${task.id}:`, error);
  }
}

export async function postTaskThreadUpdate(
  app: App,
  task: TaskWithRelations,
  updateText: string
): Promise<void> {
  const channels = await getChannelsForProject(task.projectId);
  if (channels.length === 0) return;

  for (const channel of channels) {
    try {
      await app.client.chat.postMessage({
        channel,
        text: updateText,
        ...(task.slackMsgTs ? { thread_ts: task.slackMsgTs } : {}),
      });
    } catch (error) {
      console.error(`postTaskThreadUpdate failed for task ${task.id}:`, error);
    }
  }
}

// ── Standup Prompts ───────────────────────────────────────────

export async function sendStandupPrompts(app: App): Promise<void> {
  const members = await prisma.member.findMany({
    where: { notificationPrefs: { has: "standup_prompts" } },
    include: {
      projects: {
        where: { project: { status: "ACTIVE" } },
        include: {
          project: {
            include: {
              notificationTargets: { where: { type: "CHANNEL" } },
            },
          },
        },
      },
    },
  });

  for (const member of members) {
    try {
      const seen = new Set<string>();
      const projectChannels: { name: string; channelId: string }[] = [];

      for (const pm of member.projects) {
        for (const target of pm.project.notificationTargets) {
          if (!seen.has(target.slackChannelId)) {
            seen.add(target.slackChannelId);
            projectChannels.push({ name: pm.project.name, channelId: target.slackChannelId });
          }
        }
        // legacy slackChannel fallback
        const legacy = pm.project.slackChannel;
        if (legacy && !seen.has(legacy)) {
          seen.add(legacy);
          projectChannels.push({ name: pm.project.name, channelId: legacy });
        }
      }

      const blocks = buildStandupDmPrompt(member.displayName, projectChannels);

      await app.client.chat.postMessage({
        channel: member.slackId,
        text: `📋 Time for your daily standup, ${member.displayName}!`,
        blocks,
      });
    } catch (error) {
      console.error(`Failed to send standup prompt to ${member.displayName}:`, error);
    }
  }
}

// ── Milestone Alerts ─────────────────────────────────────────

export async function sendMilestoneAlerts(
  app: App,
  changed: { id: string; title: string; projectId: string; status: string; prevStatus: string }[]
): Promise<void> {
  for (const m of changed) {
    const project = await prisma.project.findUnique({
      where: { id: m.projectId },
      include: { notificationTargets: { where: { type: "CHANNEL" } } },
    });
    const channelId = project?.notificationTargets?.[0]?.slackChannelId;
    if (!channelId) continue;

    if (m.status === "COMPLETED") {
      // Check slackMsgTs to avoid double-posting
      const fresh = await prisma.milestone.findUnique({ where: { id: m.id } });
      if (fresh?.slackMsgTs) continue;

      const result = await app.client.chat.postMessage({
        channel: channelId,
        text: `🎉 Milestone completed: *${m.title}* — great work, team!`,
        blocks: buildMilestoneCelebrationCard(m.title, project!.name),
      });
      if (result.ts) {
        await prisma.milestone.update({
          where: { id: m.id },
          data: { slackMsgTs: result.ts as string },
        });
      }
    } else if (m.status === "AT_RISK" || m.status === "BEHIND") {
      await app.client.chat.postMessage({
        channel: channelId,
        text: `${m.status === "BEHIND" ? "🚨" : "⚠️"} Milestone *${m.title}* is ${m.status.toLowerCase().replace("_", " ")}.`,
        blocks: buildMilestoneAlertCard(m),
      });
    }
  }
}

// ── Stale Task Warnings ───────────────────────────────────────

export async function sendAllStaleTaskWarnings(app: App): Promise<void> {
  const fiveDaysAgo = new Date(Date.now() - 5 * 86_400_000);

  const staleTasks = await prisma.task.findMany({
    where: {
      status: { not: "DONE" },
      updatedAt: { lt: fiveDaysAgo },
    },
    include: { assignees: true, project: true },
    orderBy: [{ projectId: "asc" }, { updatedAt: "asc" }],
  });

  if (staleTasks.length === 0) return;

  // Group by project
  const byProject = new Map<string, typeof staleTasks>();
  for (const task of staleTasks) {
    const bucket = byProject.get(task.projectId) ?? [];
    bucket.push(task);
    byProject.set(task.projectId, bucket);
  }

  for (const [projectId, tasks] of byProject) {
    try {
      const channels = await getChannelsForProject(projectId);
      if (channels.length === 0) continue;

      const project = tasks[0].project;
      const blocks = buildStaleTasksCard(project, tasks);

      await Promise.all(
        channels.map((channel) =>
          app.client.chat.postMessage({
            channel,
            text: `⚠️ ${tasks.length} stale task${tasks.length > 1 ? "s" : ""} in ${project.name}`,
            blocks,
          })
        )
      );
    } catch (error) {
      console.error(`Failed to post stale task warning for project ${projectId}:`, error);
    }
  }
}
