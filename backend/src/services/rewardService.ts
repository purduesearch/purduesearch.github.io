// Engagement reward service. All XP/doubloon grants flow through here so that
// rank recalculation, audit logging, and Slack notifications stay in one place.

import { prisma } from "../db/prisma.js";
import {
  Rank,
  RewardEventType,
  XpSource,
  DoubloonSource,
} from "@prisma/client";
import { queueDm } from "./dmBatcher.js";
import { logAuditEvent } from "./activityService.js";
import { recordActivity } from "./streakService.js";
import { createNotification } from "./notificationCrud.js";

// Streak activity hook — never throws into the caller. Returns a Promise so
// hot paths (e.g. handleTaskComplete) can await before responding, ensuring
// the frontend's subsequent /api/members/:id/streak refetch sees the new value.
async function tickStreak(memberId: string, source: Parameters<typeof recordActivity>[1]): Promise<void> {
  try {
    await recordActivity(memberId, source);
  } catch (err) {
    console.error(`[streak] recordActivity ${source}:`, err);
  }
}

/** Multiply by the member's active XP boost, if any. Returns the boosted amount and the multiplier used. */
async function applyXpMultiplier(memberId: string, amount: number): Promise<{ boosted: number; multiplier: number }> {
  if (amount <= 0) return { boosted: amount, multiplier: 1 };
  try {
    const effect = await prisma.activeEffect.findUnique({
      where: { memberId_effectKey: { memberId, effectKey: "XP_BOOST_24H" } },
    });
    if (!effect) return { boosted: amount, multiplier: 1 };
    if (effect.expiresAt.getTime() <= Date.now()) {
      // Lazy expiry — clean it up.
      prisma.activeEffect.delete({ where: { id: effect.id } }).catch(() => {});
      return { boosted: amount, multiplier: 1 };
    }
    const multiplier = effect.multiplier ?? 1;
    return { boosted: Math.round(amount * multiplier), multiplier };
  } catch (err) {
    console.error("[reward] applyXpMultiplier:", err);
    return { boosted: amount, multiplier: 1 };
  }
}

// ── Rank thresholds (sorted ascending; recalculateRank walks from highest) ──

export type RankThreshold = { rank: Rank; minXp: number };

export const RANK_THRESHOLDS: RankThreshold[] = [
  { rank: "CELESTIAL",  minXp: 21000 },
  { rank: "COSMONAUT",  minXp: 12500 },
  { rank: "PIONEER",    minXp:  7000 },
  { rank: "SPECIALIST", minXp:  3500 },
  { rank: "CADET",      minXp:  1500 },
  { rank: "FLEDGLING",  minXp:   500 },
  { rank: "NESTLING",   minXp:     0 },
];

export const RANK_ORDER: Rank[] = [
  "NESTLING", "FLEDGLING", "CADET", "SPECIALIST", "PIONEER", "COSMONAUT", "CELESTIAL",
];

const RANK_DISPLAY: Record<Rank, string> = {
  NESTLING:   "Nestling",
  FLEDGLING:  "Fledgling",
  CADET:      "Cadet",
  SPECIALIST: "Specialist",
  PIONEER:    "Pioneer",
  COSMONAUT:  "Cosmonaut",
  CELESTIAL:  "Celestial",
};

export function rankForXp(xp: number): Rank {
  for (const t of RANK_THRESHOLDS) {
    if (xp >= t.minXp) return t.rank;
  }
  return "NESTLING";
}

// ── Core grants ─────────────────────────────────────────────

export type GrantOpts = { taskId?: string; approvedById?: string };

export async function grantXP(
  memberId: string,
  amount: number,
  source: XpSource,
  opts: GrantOpts = {}
): Promise<{ newXp: number; xpDelta: number; rankBefore: Rank; rankAfter: Rank }> {
  if (amount === 0) {
    const m = await prisma.member.findUnique({ where: { id: memberId }, select: { xp: true, rank: true } });
    return { newXp: m?.xp ?? 0, xpDelta: 0, rankBefore: m?.rank ?? "NESTLING", rankAfter: m?.rank ?? "NESTLING" };
  }
  const before = await prisma.member.findUnique({ where: { id: memberId }, select: { rank: true } });
  const rankBefore = before?.rank ?? "NESTLING";

  // Apply active XP boost (e.g. XP_BOOST_24H consumable) — only on positive grants.
  const { boosted } = amount > 0 ? await applyXpMultiplier(memberId, amount) : { boosted: amount };
  const grantAmount = boosted;

  // Member.xp and the XpEvent ledger must move together — a crash between
  // the two would drift the running total from the audit trail.
  const [updated] = await prisma.$transaction([
    prisma.member.update({
      where: { id: memberId },
      data:  { xp: { increment: grantAmount } },
      select: { xp: true },
    }),
    prisma.xpEvent.create({
      data: {
        memberId,
        amount: grantAmount,
        source,
        taskId: opts.taskId ?? null,
        approvedById: opts.approvedById ?? null,
      },
    }),
  ]);

  const { rankAfter } = await recalculateRank(memberId);
  return { newXp: updated.xp, xpDelta: grantAmount, rankBefore, rankAfter };
}

export async function grantDoubloons(
  memberId: string,
  amount: number,
  source: DoubloonSource,
  opts: { taskId?: string; cosmeticId?: string } = {}
): Promise<{ newBalance: number; doubloonsDelta: number }> {
  if (amount === 0) {
    const m = await prisma.member.findUnique({ where: { id: memberId }, select: { doubloons: true } });
    return { newBalance: m?.doubloons ?? 0, doubloonsDelta: 0 };
  }
  const [updated] = await prisma.$transaction([
    prisma.member.update({
      where: { id: memberId },
      data:  { doubloons: { increment: amount } },
      select: { doubloons: true },
    }),
    prisma.doubloonEvent.create({
      data: {
        memberId, amount, source,
        taskId: opts.taskId ?? null,
        cosmeticId: opts.cosmeticId ?? null,
      },
    }),
  ]);
  return { newBalance: updated.doubloons, doubloonsDelta: amount };
}

// ── Rank recalc + Slack announcement ────────────────────────

export async function recalculateRank(memberId: string): Promise<{ rankBefore: Rank; rankAfter: Rank }> {
  const m = await prisma.member.findUnique({
    where: { id: memberId },
    select: { xp: true, rank: true, displayName: true, slackId: true, equippedBadgeId: true },
  });
  if (!m) return { rankBefore: "NESTLING", rankAfter: "NESTLING" };

  const computed = rankForXp(m.xp);
  if (computed === m.rank) return { rankBefore: m.rank, rankAfter: m.rank };

  await prisma.member.update({ where: { id: memberId }, data: { rank: computed } });
  const rankBefore = m.rank;
  const rankAfter  = computed;

  // Auto-grant the matching rank badge cosmetic (if it exists) so it shows on the profile.
  const badgeName = `${RANK_DISPLAY[rankAfter]} Badge`;
  const badge = await prisma.cosmetic.findFirst({ where: { name: badgeName, category: "BADGE" } });
  if (badge) {
    await prisma.memberCosmetic.upsert({
      where:  { memberId_cosmeticId: { memberId, cosmeticId: badge.id } },
      update: {},
      create: { memberId, cosmeticId: badge.id },
    });
    // If the member has nothing equipped in their rank slot, auto-equip the
    // freshly granted badge so they get immediate visual feedback on rank-up.
    if (!m.equippedBadgeId) {
      await prisma.member.update({
        where: { id: memberId },
        data:  { equippedBadgeId: badge.id },
      });
    }
  }

  // Rank-up celebration is client-only (RankUpModal); no Slack post or DM.
  return { rankBefore, rankAfter };
}

// ── Pending reward queue (admin approval gate) ──────────────

export async function queuePendingReward(
  memberId: string,
  eventType: RewardEventType,
  taskId?: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  const cfg = await prisma.rewardEventConfig.findUnique({ where: { eventType } });
  const proposedXp        = Math.min(100, cfg?.xpAmount       ?? 0);
  const proposedDoubloons = Math.min(100, cfg?.doubloonAmount ?? 0);

  const pending = await prisma.pendingReward.create({
    data: {
      memberId,
      eventType,
      taskId: taskId ?? null,
      proposedXp,
      proposedDoubloons,
      metadata: (metadata ?? {}) as any,
    },
  });

  try {
    const member = await prisma.member.findUnique({
      where: { id: memberId },
      select: { displayName: true }
    });
    const admins = await prisma.member.findMany({
      where: { isAdmin: true },
      select: { id: true }
    });
    const taskTitle = (metadata as any)?.taskTitle ?? "contribution";
    for (const admin of admins) {
      await createNotification({
        type: "SYSTEM",
        recipientId: admin.id,
        taskId: taskId ?? undefined,
        message: `Pending reward request from ${member?.displayName || "Member"} for "${taskTitle}" — +${proposedXp} XP, +${proposedDoubloons} doubloons.`,
        metadata: {
          type: "PENDING_REWARD_CREATED",
          pendingId: pending.id,
          taskId: taskId ?? undefined,
        },
      });
    }
  } catch (err) {
    console.error("[reward] failed to create admin notifications for pending reward:", err);
  }
}

export async function approveReward(
  pendingId: string,
  adminId: string,
  overrides: { adjustedXp?: number; adjustedDoubloons?: number } = {}
): Promise<void> {
  const pending = await prisma.pendingReward.findUnique({ where: { id: pendingId } });
  if (!pending) {
    throw new Error("Pending reward not found or already processed");
  }
  const xpAmount = Math.min(100, overrides.adjustedXp        ?? pending.proposedXp);
  const dbAmount = Math.min(100, overrides.adjustedDoubloons ?? pending.proposedDoubloons);
  const adjusted =
    overrides.adjustedXp        !== undefined && overrides.adjustedXp        !== pending.proposedXp ||
    overrides.adjustedDoubloons !== undefined && overrides.adjustedDoubloons !== pending.proposedDoubloons;

  // Atomic claim: only one concurrent caller can flip PENDING → APPROVED/ADJUSTED.
  // Whoever loses the race (count === 0) must not grant XP/doubloons.
  const claimed = await prisma.pendingReward.updateMany({
    where: { id: pendingId, status: "PENDING" },
    data:  {
      status:       adjusted ? "ADJUSTED" : "APPROVED",
      reviewedById: adminId,
      reviewedAt:   new Date(),
    },
  });
  if (claimed.count === 0) {
    throw new Error("Pending reward not found or already processed");
  }

  const xpSource: XpSource = eventTypeToXpSource(pending.eventType);
  const dbSource: DoubloonSource = eventTypeToDoubloonSource(pending.eventType);
  if (xpAmount > 0) await grantXP(pending.memberId, xpAmount, xpSource, { taskId: pending.taskId ?? undefined, approvedById: adminId });
  if (dbAmount > 0) await grantDoubloons(pending.memberId, dbAmount, dbSource, { taskId: pending.taskId ?? undefined });

  // SSE notification → triggers reward animation + balance refresh on the recipient's client.
  const taskTitle = (pending.metadata as any)?.taskTitle ?? "your contribution";
  createNotification({
    type: "SYSTEM",
    recipientId: pending.memberId,
    taskId: pending.taskId ?? undefined,
    message: `✅ Reward approved for "${taskTitle}" — +${xpAmount} XP, +${dbAmount} doubloons.`,
    metadata: {
      type: "REWARD_APPROVED",
      xpDelta: xpAmount,
      doubloonsDelta: dbAmount,
      taskTitle,
    },
  }).catch(err => console.error("[reward] createNotification:", err));

  // Slack DM to recipient
  const member = await prisma.member.findUnique({ where: { id: pending.memberId }, select: { slackId: true, displayName: true } });
  if (member?.slackId) {
    queueDm(member.slackId,
      `✅ Reward approved for *${taskTitle}* — +${xpAmount} XP, +${dbAmount} doubloons.`);
  }
}

export async function rejectReward(pendingId: string, adminId: string): Promise<void> {
  const pending = await prisma.pendingReward.findUnique({ where: { id: pendingId } });
  if (!pending) {
    throw new Error("Pending reward not found or already processed");
  }
  const claimed = await prisma.pendingReward.updateMany({
    where: { id: pendingId, status: "PENDING" },
    data:  { status: "REJECTED", reviewedById: adminId, reviewedAt: new Date() },
  });
  if (claimed.count === 0) {
    throw new Error("Pending reward not found or already processed");
  }

  const member = await prisma.member.findUnique({ where: { id: pending.memberId }, select: { slackId: true } });
  if (member?.slackId) {
    const taskTitle = (pending.metadata as any)?.taskTitle ?? "your contribution";
    queueDm(member.slackId, `ℹ️ A pending reward for *${taskTitle}* was not granted by an admin.`);
  }
}

// ── Event-type ↔ source mappings ────────────────────────────

function eventTypeToXpSource(e: RewardEventType): XpSource {
  switch (e) {
    case "TIME_LOG_HOUR":                return "TIME_LOG";
    case "TASK_COMPLETE_ADMIN_CREATED":
    case "TASK_COMPLETE_MEMBER_CREATED": return "TASK_COMPLETE";
    case "MILESTONE_HIT":                return "MILESTONE";
    case "KUDOS_RECEIVED":               return "KUDOS";
    case "BLOG_POST_PUBLISHED":          return "BLOG_POST";
    case "EARLY_DELIVERY_BONUS":         return "EARLY_BONUS";
    case "MEETING_AVAILABILITY_SUBMITTED": return "MEETING";
  }
}

function eventTypeToDoubloonSource(e: RewardEventType): DoubloonSource {
  switch (e) {
    case "TIME_LOG_HOUR":                return "TIME_LOG";
    case "TASK_COMPLETE_ADMIN_CREATED":
    case "TASK_COMPLETE_MEMBER_CREATED": return "TASK_COMPLETE";
    case "MILESTONE_HIT":                return "MILESTONE";
    case "KUDOS_RECEIVED":               return "KUDOS";
    case "BLOG_POST_PUBLISHED":          return "BLOG_POST";
    case "EARLY_DELIVERY_BONUS":         return "EARLY_BONUS";
    case "MEETING_AVAILABILITY_SUBMITTED": return "MEETING";
  }
}

// ── High-level hooks called from route handlers ─────────────

type TaskWithRelations = {
  id: string;
  title: string;
  dueDate: Date | null;
  createdById: string | null;
  assignees: { id: string }[];
};

export type ActorRewardSummary = {
  xpDelta: number;
  doubloonsDelta: number;
  newXp: number | null;
  newDoubloons: number | null;
  rankBefore: Rank | null;
  rankAfter: Rank | null;
  // When the grant was deferred to admin approval (admin-gated). The frontend
  // surfaces this as a "Reward submitted for review" toast instead of firing
  // the +XP flux animation.
  queued?: boolean;
  taskTitle?: string;
};

// All TASK_COMPLETE_* grants are always admin-gated (per engagement plan):
// auto-approve config is ignored so exploiting status toggles can't yield XP.
const ADMIN_GATED_EVENT_TYPES = new Set<RewardEventType>([
  "TASK_COMPLETE_ADMIN_CREATED",
  "TASK_COMPLETE_MEMBER_CREATED",
]);

export async function handleTaskComplete(
  task: TaskWithRelations,
  actorId: string
): Promise<ActorRewardSummary | null> {
  // Determine event type from creator's role
  let eventType: RewardEventType = "TASK_COMPLETE_MEMBER_CREATED";
  if (task.createdById) {
    const creator = await prisma.member.findUnique({
      where: { id: task.createdById },
      select: { isAdmin: true, role: true },
    });
    if (creator?.isAdmin || creator?.role === "LEAD" || creator?.role === "ADMIN") {
      eventType = "TASK_COMPLETE_ADMIN_CREATED";
    }
  } else {
    // No creator recorded → treat as admin-created (system task)
    eventType = "TASK_COMPLETE_ADMIN_CREATED";
  }

  const cfg = await prisma.rewardEventConfig.findUnique({ where: { eventType } });
  if (!cfg) return null;

  // Idempotency: if this task already had its completion grant fire (in any
  // shape — direct or queued), skip. Prevents DONE→IN_PROGRESS→DONE re-grant.
  const existingTask = await prisma.task.findUnique({
    where: { id: task.id },
    select: { rewardGrantedAt: true },
  });
  if (existingTask?.rewardGrantedAt) return null;
  const existingPending = await prisma.pendingReward.findFirst({
    where: {
      taskId: task.id,
      eventType: { in: ["TASK_COMPLETE_ADMIN_CREATED", "TASK_COMPLETE_MEMBER_CREATED"] },
      status:    { in: ["PENDING", "APPROVED", "ADJUSTED"] },
    },
    select: { id: true },
  });
  if (existingPending) return null;

  const earlyByMs = task.dueDate ? task.dueDate.getTime() - Date.now() : 0;
  const earlyBonusEligible = task.dueDate !== null && earlyByMs >= 24 * 60 * 60 * 1000;

  // All task completions are admin-gated regardless of RewardEventConfig.autoApprove.
  const forceQueue = ADMIN_GATED_EVENT_TYPES.has(eventType);

  let actorSummary: ActorRewardSummary | null = null;

  for (const assignee of task.assignees) {
    const isActor = assignee.id === actorId;

    if (forceQueue || !cfg.autoApprove) {
      await queuePendingReward(assignee.id, eventType, task.id, {
        taskTitle: task.title,
        proposedXp: cfg.xpAmount,
        proposedDoubloons: cfg.doubloonAmount,
        earlyBonusEligible,
      });
      // Early-delivery bonus also queues as its own row, so admins can adjust
      // or reject it independently.
      if (earlyBonusEligible) {
        await queuePendingReward(assignee.id, "EARLY_DELIVERY_BONUS", task.id, {
          taskTitle: task.title,
          proposedXp: Math.round(cfg.xpAmount * 0.5),
          proposedDoubloons: Math.round(cfg.doubloonAmount * 0.5),
        });
      }
    }
    await tickStreak(assignee.id, "TASK_COMPLETE");

    if (isActor) {
      actorSummary = {
        xpDelta: 0,
        doubloonsDelta: 0,
        newXp: null,
        newDoubloons: null,
        rankBefore: null,
        rankAfter: null,
        queued: true,
        taskTitle: task.title,
      };
    }
  }

  // Mark the task as having had its completion grant fire so future toggles
  // can't re-trigger it (even if the pending row is later rejected).
  await prisma.task.update({
    where: { id: task.id },
    data:  { rewardGrantedAt: new Date() },
  });

  return actorSummary;
}

// Anti-abuse caps for time-log rewards. Anything beyond DAILY_HOURS_CAP/day
// is silently ignored (the log is still recorded, just doesn't yield XP).
// Single logs > SINGLE_LOG_ADMIN_THRESHOLD_MINUTES get queued for admin review
// instead of auto-granting.
const TIME_LOG_DAILY_HOURS_CAP = 8;
const TIME_LOG_SINGLE_ADMIN_THRESHOLD_MIN = 120;

export async function handleTimeLog(taskId: string, memberId: string, minutes: number): Promise<void> {
  const cfg = await prisma.rewardEventConfig.findUnique({ where: { eventType: "TIME_LOG_HOUR" } });
  void tickStreak(memberId, "TIME_LOG");
  if (!cfg || !cfg.autoApprove) return; // time-log rewards are auto-approve by default

  // Large single logs are admin-reviewed (caller can fake "logged 10h").
  if (minutes > TIME_LOG_SINGLE_ADMIN_THRESHOLD_MIN) {
    await queuePendingReward(memberId, "TIME_LOG_HOUR", taskId, {
      minutes,
      reason: "single_log_exceeds_admin_threshold",
    });
    return;
  }

  // Aggregate today's logged minutes; if granting these minutes would exceed
  // the daily cap, only grant up to the remainder (silently truncate).
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const sumToday = await prisma.timeLog.aggregate({
    where: { memberId, loggedAt: { gte: dayStart } },
    _sum: { minutes: true },
  });
  const minutesAlreadyToday = sumToday._sum.minutes ?? 0;
  const capMinutes = TIME_LOG_DAILY_HOURS_CAP * 60;
  // The current log was already persisted before this is called, so it's
  // included in `minutesAlreadyToday`. We grant XP only for the portion
  // that fits under the cap.
  const minutesUnderCap = Math.max(0, Math.min(minutes, capMinutes - (minutesAlreadyToday - minutes)));
  if (minutesUnderCap <= 0) return;

  const hours = minutesUnderCap / 60;
  const xp = Math.round(cfg.xpAmount       * hours);
  const db = Math.round(cfg.doubloonAmount * hours);
  if (xp > 0) await grantXP(memberId, xp, "TIME_LOG", { taskId });
  if (db > 0) await grantDoubloons(memberId, db, "TIME_LOG", { taskId });
}

export async function handleMilestoneComplete(milestoneId: string): Promise<void> {
  const cfg = await prisma.rewardEventConfig.findUnique({ where: { eventType: "MILESTONE_HIT" } });
  if (!cfg) return;

  // Contributors = unique assignees of all tasks under the milestone
  const tasks = await prisma.task.findMany({
    where: { milestoneId },
    select: { assignees: { select: { id: true } } },
  });
  const contributorIds = new Set<string>();
  for (const t of tasks) for (const a of t.assignees) contributorIds.add(a.id);

  for (const memberId of contributorIds) {
    if (cfg.autoApprove) {
      if (cfg.xpAmount       > 0) await grantXP(memberId, cfg.xpAmount, "MILESTONE");
      if (cfg.doubloonAmount > 0) await grantDoubloons(memberId, cfg.doubloonAmount, "MILESTONE");
    } else {
      await queuePendingReward(memberId, "MILESTONE_HIT", undefined, { milestoneId });
    }
    void tickStreak(memberId, "MILESTONE_COMPLETE");
  }
}

export async function handleKudosReceived(toMemberId: string, fromMemberId: string): Promise<void> {
  const cfg = await prisma.rewardEventConfig.findUnique({ where: { eventType: "KUDOS_RECEIVED" } });
  if (!cfg || !cfg.autoApprove) return;

  // Anti-alt-account safeguard: only the first kudos from a given sender to
  // a given recipient in any 24-hour window yields XP/DB. The current Kudos
  // row has already been written, so we look for >1 row in the past 24h.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recentFromSamePair = await prisma.kudos.count({
    where: { fromId: fromMemberId, toId: toMemberId, createdAt: { gte: since } },
  });
  if (recentFromSamePair > 1) return;

  if (cfg.xpAmount       > 0) await grantXP(toMemberId, cfg.xpAmount, "KUDOS");
  if (cfg.doubloonAmount > 0) await grantDoubloons(toMemberId, cfg.doubloonAmount, "KUDOS");
}

export async function handleBlogPostPublished(authorMemberId: string, submissionId: string): Promise<void> {
  void tickStreak(authorMemberId, "BLOG_POST_PUBLISHED");
  const cfg = await prisma.rewardEventConfig.findUnique({ where: { eventType: "BLOG_POST_PUBLISHED" } });
  if (!cfg) return;
  if (cfg.autoApprove) {
    if (cfg.xpAmount       > 0) await grantXP(authorMemberId, cfg.xpAmount, "BLOG_POST");
    if (cfg.doubloonAmount > 0) await grantDoubloons(authorMemberId, cfg.doubloonAmount, "BLOG_POST");
  } else {
    await queuePendingReward(authorMemberId, "BLOG_POST_PUBLISHED", undefined, { submissionId });
  }
}

export async function handleMeetingAvailabilitySubmitted(memberId: string): Promise<void> {
  const cfg = await prisma.rewardEventConfig.findUnique({
    where: { eventType: "MEETING_AVAILABILITY_SUBMITTED" },
  });
  if (!cfg || !cfg.autoApprove) return;
  if (cfg.xpAmount       > 0) await grantXP(memberId, cfg.xpAmount, "MEETING");
  if (cfg.doubloonAmount > 0) await grantDoubloons(memberId, cfg.doubloonAmount, "MEETING");
}

// Silence unused-import warning for logAuditEvent (reserved for future approval audit).
void logAuditEvent;
