// Kudos service — weekly-capped heart taps between members.
// Caps: 3 sent / 5 received per ISO week (Monday-Sunday) per member.

import { prisma } from "../db/prisma.js";
import { handleKudosReceived } from "./rewardService.js";
import { queueDm } from "./dmBatcher.js";
import { createNotification } from "./notificationCrud.js";

export const WEEKLY_SEND_CAP    = 3;
export const WEEKLY_RECEIVE_CAP = 5;

/** Start of the current ISO week (Monday 00:00 UTC). */
function startOfWeek(now: Date = new Date()): Date {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dow = d.getUTCDay(); // 0=Sun..6=Sat
  const back = dow === 0 ? 6 : dow - 1;
  d.setUTCDate(d.getUTCDate() - back);
  return d;
}

/** Bonus sends granted by the Kudos Refill consumable for the current ISO week. */
async function bonusSendsForWeek(memberId: string, weekStart: Date): Promise<number> {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { weeklyBonusSends: true, weeklyBonusSendsWeek: true },
  });
  if (!member?.weeklyBonusSendsWeek) return 0;
  if (member.weeklyBonusSendsWeek.getTime() !== weekStart.getTime()) return 0;
  return member.weeklyBonusSends ?? 0;
}

export class KudosCapError extends Error {
  constructor(public readonly which: "sent" | "received", message: string) { super(message); }
}

export async function sendKudos(
  fromId: string,
  toId: string,
  message?: string
): Promise<{
  sentThisWeek: number;
  receivedThisWeek: number;
  sendCapRemaining: number;
  receiveCapRemaining: number;
}> {
  if (fromId === toId) {
    throw new Error("Cannot send kudos to yourself");
  }

  const weekStart = startOfWeek();
  const [sentThisWeek, receivedThisWeek, bonusSends] = await Promise.all([
    prisma.kudos.count({ where: { fromId, createdAt: { gte: weekStart } } }),
    prisma.kudos.count({ where: { toId,   createdAt: { gte: weekStart } } }),
    bonusSendsForWeek(fromId, weekStart),
  ]);
  const effectiveSendCap = WEEKLY_SEND_CAP + bonusSends;

  if (sentThisWeek >= effectiveSendCap) {
    throw new KudosCapError("sent", `You've sent your ${effectiveSendCap} kudos for this week.`);
  }
  if (receivedThisWeek >= WEEKLY_RECEIVE_CAP) {
    throw new KudosCapError("received", `This member has already received the weekly maximum of ${WEEKLY_RECEIVE_CAP} kudos.`);
  }

  await prisma.kudos.create({
    data: { fromId, toId, message: message ?? null },
  });

  // Engagement reward (fire-and-forget)
  handleKudosReceived(toId, fromId).catch(err =>
    console.error("[kudos] handleKudosReceived:", err));

  // In-app + Slack notification to the recipient (fire-and-forget)
  void (async () => {
    const [from, to] = await Promise.all([
      prisma.member.findUnique({ where: { id: fromId }, select: { displayName: true } }),
      prisma.member.findUnique({ where: { id: toId },   select: { slackId: true } }),
    ]);
    try {
      await createNotification({
        type: "SYSTEM",
        recipientId: toId,
        actorId: fromId,
        message: `${from?.displayName ?? "Someone"} sent you kudos!`,
      });
    } catch (err) { console.error("[kudos] notification:", err); }
    if (to?.slackId) {
      queueDm(to.slackId, `❤️ *${from?.displayName ?? "Someone"}* sent you kudos!`);
    }
  })();

  return {
    sentThisWeek:        sentThisWeek + 1,
    receivedThisWeek:    receivedThisWeek + 1,
    sendCapRemaining:    effectiveSendCap - (sentThisWeek + 1),
    receiveCapRemaining: WEEKLY_RECEIVE_CAP - (receivedThisWeek + 1),
  };
}

/** All kudos sent during the current ISO week, with from/to display names. */
export async function getWeeklyKudos() {
  const weekStart = startOfWeek();
  return prisma.kudos.findMany({
    where: { createdAt: { gte: weekStart } },
    include: {
      from: { select: { id: true, displayName: true, slackHandle: true } },
      to:   { select: { id: true, displayName: true, slackHandle: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

/** Caps remaining for a specific (sender, recipient) pair, used by GET handler. */
export async function getKudosCaps(fromId: string, toId: string): Promise<{
  sendCapRemaining: number;
  receiveCapRemaining: number;
}> {
  const weekStart = startOfWeek();
  const [sent, received, bonusSends] = await Promise.all([
    prisma.kudos.count({ where: { fromId, createdAt: { gte: weekStart } } }),
    prisma.kudos.count({ where: { toId,   createdAt: { gte: weekStart } } }),
    bonusSendsForWeek(fromId, weekStart),
  ]);
  return {
    sendCapRemaining:    Math.max(0, WEEKLY_SEND_CAP + bonusSends - sent),
    receiveCapRemaining: Math.max(0, WEEKLY_RECEIVE_CAP            - received),
  };
}
