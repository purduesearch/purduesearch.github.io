import type { Prisma, SlackCardKind, SlackEntityType } from "@prisma/client";
import type { KnownBlock } from "@slack/types";
import { prisma } from "../db/prisma.js";
import { buildTaskBundle, type CardTask } from "../slack/views/taskCard.js";
import { planBundles } from "./slackCardCore.js";
import { onTaskChanged } from "./taskChangeBus.js";
import { canNotifyMember } from "./notificationGate.js";

export type CardMessage = Prisma.SlackCardMessageGetPayload<{ include: { refs: true } }>;
export type CardRenderer = (message: CardMessage) => Promise<{ text: string; blocks: KnownBlock[] }>;
const renderers = new Map<SlackCardKind, CardRenderer>();
const refreshTimers = new Map<string, NodeJS.Timeout>();
let flushing = false;
let refreshStarted = false;

export function startCardRefresh(): void {
  if (refreshStarted) return;
  refreshStarted = true;
  onTaskChanged(ids => ids.forEach(id => refreshCardsSoon("TASK", id)));
}

export function registerCardRenderer(kind: SlackCardKind, renderer: CardRenderer): void {
  renderers.set(kind, renderer);
}

export async function queueCard(opts: { recipientId: string; entityType: SlackEntityType; entityId: string; reason: string; actorId?: string | null }): Promise<void> {
  await prisma.slackCardQueue.create({ data: opts });
}

type LoadedCardTask = CardTask & { editableMemberIds: string[] };
export async function loadCardTask(taskId: string): Promise<LoadedCardTask | null> {
  const task = await prisma.task.findFirst({
    where: { id: taskId, archivedAt: null },
    include: {
      assignees: { select: { id: true, slackId: true, displayName: true } },
      project: { select: { name: true, members: { select: { memberId: true } } } },
      milestone: { select: { title: true, dueDate: true } },
      subtasks: { where: { archivedAt: null }, select: { status: true } },
      blockedBy: { where: { blockingTask: { status: { not: "DONE" }, archivedAt: null } }, select: { blockingTask: { select: { status: true } } } },
      blockers: { where: { blocker: { resolvedAt: null } }, include: { blocker: { select: { label: true } } } },
      timeLogs: { select: { minutes: true } },
    },
  });
  if (!task) return null;
  return {
    id: task.id, title: task.title, status: task.status, priority: task.priority,
    dueDate: task.dueDate, projectId: task.projectId, project: { name: task.project.name },
    assignees: task.assignees, milestone: task.milestone,
    subtaskCounts: { total: task.subtasks.length, done: task.subtasks.filter(t => t.status === "DONE").length },
    blockedByOpen: task.blockedBy.length,
    categoryBlockers: task.blockers.map(b => b.blocker.label),
    loggedMinutes: task.timeLogs.reduce((sum, log) => sum + log.minutes, 0),
    editableMemberIds: task.project.members.map(m => m.memberId),
  };
}

async function renderTaskBundle(recipientId: string, entityIds: string[], actorIds: string[], now = new Date()) {
  const [recipient, loaded, actors] = await Promise.all([
    prisma.member.findUnique({ where: { id: recipientId } }),
    Promise.all(entityIds.map(loadCardTask)),
    prisma.member.findMany({ where: { id: { in: [...new Set(actorIds)] } }, select: { displayName: true } }),
  ]);
  const tasks = loaded.filter((task): task is LoadedCardTask => task !== null && task.assignees.some(a => a.id === recipientId));
  const rendered = buildTaskBundle(recipient?.displayName ?? "Your", actors.map(a => a.displayName), tasks, task => ({
    memberId: recipientId, isAssignee: true,
    canEdit: Boolean(recipient?.isAdmin || (task as LoadedCardTask).editableMemberIds.includes(recipientId)),
  }), now);
  return { recipient, tasks, rendered };
}

registerCardRenderer("TASK_BUNDLE", async message => {
  if (!message.recipientId) throw new Error("TASK_BUNDLE_RECIPIENT_MISSING");
  const queued = await prisma.slackCardQueue.findMany({ where: { messageId: message.id }, select: { actorId: true } });
  const { rendered } = await renderTaskBundle(message.recipientId,
    message.refs.filter(ref => ref.entityType === "TASK").sort((a, b) => a.position - b.position).map(ref => ref.entityId),
    queued.flatMap(row => row.actorId ? [row.actorId] : []));
  return rendered;
});

export async function flushDueCardBundles(now: Date = new Date()): Promise<number> {
  if (flushing) return 0;
  flushing = true;
  let sent = 0;
  try {
    const rows = await prisma.slackCardQueue.findMany({ where: { sentAt: null }, orderBy: [{ queuedAt: "asc" }, { id: "asc" }] });
    for (const bundle of planBundles(rows, now)) {
      const selected = rows.filter(row => bundle.rowIds.includes(row.id));
      if (!await canNotifyMember(bundle.recipientId)) {
        await prisma.slackCardQueue.updateMany({ where: { id: { in: bundle.rowIds }, sentAt: null }, data: { sentAt: now } });
        continue;
      }
      if (selected[0].entityType === "MEETING_POLL") {
        const renderer = renderers.get("POLL_INVITE");
        if (!renderer) continue;
        try {
          const recipient = await prisma.member.findUnique({ where: { id: bundle.recipientId }, select: { slackId: true } });
          if (!recipient?.slackId) {
            await prisma.slackCardQueue.updateMany({ where: { id: { in: bundle.rowIds }, sentAt: null }, data: { sentAt: now } });
            continue;
          }
          const { boltApp } = await import("../slack/bolt.js");
          const opened = await boltApp.client.conversations.open({ users: recipient.slackId });
          if (!opened.channel?.id) throw new Error("SLACK_DM_OPEN_FAILED");
          // One invite per message keeps every queued poll actionable, even for large batches.
          for (const entityId of bundle.entityIds) {
            const draft: CardMessage = {
              id: "pending", kind: "POLL_INVITE", slackChannelId: opened.channel.id, ts: "pending",
              threadTs: null, recipientId: bundle.recipientId, sourceTs: null, createdAt: now, renderedAt: now,
              refs: [{ id: "pending", messageId: "pending", entityType: "MEETING_POLL", entityId, position: 0 }],
            };
            const rendered = await renderer(draft);
            const result = await boltApp.client.chat.postMessage({ channel: opened.channel.id, ...rendered });
            if (!result.ok || !result.ts) throw new Error(result.error ?? "SLACK_POST_FAILED");
            await prisma.$transaction(async tx => {
              const message = await tx.slackCardMessage.create({ data: {
                kind: "POLL_INVITE", slackChannelId: opened.channel!.id!, ts: result.ts!, recipientId: bundle.recipientId,
                renderedAt: now, refs: { create: { entityType: "MEETING_POLL", entityId, position: 0 } },
              } });
              await tx.slackCardQueue.updateMany({ where: { id: { in: selected.filter(row => row.entityId === entityId).map(row => row.id) }, sentAt: null }, data: { sentAt: now, messageId: message.id } });
            });
            sent++;
            if (entityId !== bundle.entityIds.at(-1)) await new Promise(resolve => setTimeout(resolve, 1000));
          }
        } catch (error) { console.error("Slack poll invite delivery failed:", error); }
        continue;
      }
      // Other card kinds are delivered by their dedicated later-phase services.
      if (selected[0].entityType !== "TASK") continue;
      try {
        const { recipient, tasks, rendered } = await renderTaskBundle(bundle.recipientId, bundle.entityIds,
          selected.flatMap(row => row.actorId ? [row.actorId] : []), now);
        if (!tasks.length || !recipient?.slackId) {
          await prisma.slackCardQueue.updateMany({ where: { id: { in: bundle.rowIds }, sentAt: null }, data: { sentAt: now, messageId: null } });
          continue;
        }
        const { boltApp } = await import("../slack/bolt.js");
        const opened = await boltApp.client.conversations.open({ users: recipient.slackId });
        if (!opened.channel?.id) throw new Error("SLACK_DM_OPEN_FAILED");
        const result = await boltApp.client.chat.postMessage({ channel: opened.channel.id, ...rendered });
        if (!result.ok || !result.ts) throw new Error(result.error ?? "SLACK_POST_FAILED");
        await prisma.$transaction(async tx => {
          const message = await tx.slackCardMessage.create({ data: {
            kind: "TASK_BUNDLE", slackChannelId: opened.channel!.id!, ts: result.ts!, recipientId: bundle.recipientId,
            renderedAt: now,
            refs: { create: tasks.map((task, position) => ({ entityType: "TASK", entityId: task.id, position })) },
          } });
          await tx.slackCardQueue.updateMany({ where: { id: { in: bundle.rowIds }, sentAt: null }, data: { sentAt: now, messageId: message.id } });
        });
        sent++;
      } catch (error) {
        // Unsent rows remain durable for the next minute's retry.
        console.error("Slack card bundle delivery failed", error);
      }
    }
    return sent;
  } finally { flushing = false; }
}

async function refreshMessage(messageId: string): Promise<void> {
  const message = await prisma.slackCardMessage.findUnique({ where: { id: messageId }, include: { refs: true } });
  if (!message || Date.now() - message.renderedAt.getTime() < 3_000) return;
  const renderer = renderers.get(message.kind);
  if (!renderer) return;
  const rendered = await renderer(message);
  const { boltApp } = await import("../slack/bolt.js");
  try {
    await boltApp.client.chat.update({ channel: message.slackChannelId, ts: message.ts, ...rendered });
    await prisma.slackCardMessage.update({ where: { id: messageId }, data: { renderedAt: new Date() } });
  } catch (error) {
    if ((error as { data?: { error?: string } }).data?.error === "message_not_found") {
      await prisma.slackCardMessage.deleteMany({ where: { id: messageId } });
      return;
    }
    throw error;
  }
}

export function refreshCardsSoon(entityType: SlackEntityType, entityId: string): void {
  void prisma.slackCardRef.findMany({ where: { entityType, entityId }, select: { messageId: true } }).then(refs => {
    for (const { messageId } of refs) {
      const existing = refreshTimers.get(messageId);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(() => {
        refreshTimers.delete(messageId);
        void refreshMessage(messageId).catch(error => console.error("Slack card refresh failed", error));
      }, 5_000);
      timer.unref();
      refreshTimers.set(messageId, timer);
    }
  }).catch(error => console.error("Slack card reference lookup failed", error));
}

export async function postLinkCard(opts: { channelId: string; sourceTs: string; threadTs: string; linkerId: string }): Promise<void> {
  const handler = await import("../slack/handlers/mentions.js");
  await handler.postLinkCard(opts);
}
