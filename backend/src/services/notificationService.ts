import type { App } from "@slack/bolt";
import type { Task, Member, Project } from "@prisma/client";
import {
  buildWeeklyDigest,
  buildProjectStatusCard,
  buildTaskReminderCard,
  buildWeekAheadCard,
} from "../utils/blockKit.js";
import { prisma } from "../db/prisma.js";
import {
  getOverdueTasks,
  getTasksDueToday,
  getTasksDueThisWeek,
} from "./taskService.js";

type TaskWithRelations = Task & {
  assignee: Member | null;
  project: Project;
};

// ── Notification Service ─────────────────────────────────────

export async function sendWeeklyDigest(
  app: App,
  member: Member
): Promise<void> {
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
  if (!task.assignee) return;

  const blocks = buildTaskReminderCard(task);

  await app.client.chat.postMessage({
    channel: task.assignee.slackId,
    text: `⏰ Reminder: "${task.title}" is due ${task.dueDate ? (task.dueDate <= new Date() ? "overdue!" : "today!") : "soon!"}`,
    blocks,
  });
}

export async function postProjectHealthSummary(
  app: App,
  project: Project & { tasks: Task[] }
): Promise<void> {
  if (!project.slackChannel) return;

  const blocks = buildProjectStatusCard(project, project.tasks);

  await app.client.chat.postMessage({
    channel: project.slackChannel,
    text: `📊 Weekly health summary for ${project.name}`,
    blocks,
  });
}

export async function postWeekAheadSummary(
  app: App,
  project: Project & { tasks: (Task & { assignee: Member | null })[] }
): Promise<void> {
  if (!project.slackChannel) return;

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

  await app.client.chat.postMessage({
    channel: project.slackChannel,
    text: `📅 Week ahead for ${project.name}: ${upcomingTasks.length} tasks`,
    blocks,
  });
}

// ── Batch Operations (called by scheduler) ───────────────────

export async function sendAllDueDateReminders(app: App): Promise<void> {
  const overdueTasks = (await getOverdueTasks()) as TaskWithRelations[];
  const dueTodayTasks = (await getTasksDueToday()) as TaskWithRelations[];

  const allTasks = [...overdueTasks, ...dueTodayTasks];
  for (const task of allTasks) {
    try {
      await sendDueDateReminder(app, task);
    } catch (error) {
      console.error(
        `Failed to send reminder for task ${task.id}:`,
        error
      );
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
  const projects = await prisma.project.findMany({
    where: { status: "ACTIVE", slackChannel: { not: null } },
    include: { tasks: true },
  });

  for (const project of projects) {
    try {
      await postProjectHealthSummary(app, project);
    } catch (error) {
      console.error(
        `Failed to post health summary for ${project.name}:`,
        error
      );
    }
  }
}

export async function postAllWeekAheadSummaries(app: App): Promise<void> {
  const projects = await prisma.project.findMany({
    where: { status: "ACTIVE", slackChannel: { not: null } },
    include: { tasks: { include: { assignee: true } } },
  });

  for (const project of projects) {
    try {
      await postWeekAheadSummary(app, project);
    } catch (error) {
      console.error(
        `Failed to post week-ahead for ${project.name}:`,
        error
      );
    }
  }
}
