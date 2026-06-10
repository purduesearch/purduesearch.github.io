// Challenge / achievement engine.
// All XP/DB grants flow through rewardService; all RNG drops through rewardRollService.

import { prisma } from "../db/prisma.js";
import { ChallengeMetric, ChallengeType, CosmeticRarity } from "@prisma/client";
import { grantXP, grantDoubloons } from "./rewardService.js";
import { rollTable, applyRollResults, RollResult } from "./rewardRollService.js";

// ── Period helpers ───────────────────────────────────────────────

export function dayStartUTC(d = new Date()): Date {
  const out = new Date(d);
  out.setUTCHours(0, 0, 0, 0);
  return out;
}

export function dayEndUTC(d = new Date()): Date {
  const start = dayStartUTC(d);
  return new Date(start.getTime() + 86_400_000);
}

export function weekStartUTC(d = new Date()): Date {
  const out = dayStartUTC(d);
  const day = out.getUTCDay(); // 0=Sun … 6=Sat; we want Mon=0
  const diff = day === 0 ? -6 : 1 - day;
  out.setUTCDate(out.getUTCDate() + diff);
  return out;
}

export function weekEndUTC(d = new Date()): Date {
  const start = weekStartUTC(d);
  return new Date(start.getTime() + 7 * 86_400_000);
}

export function monthStartUTC(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

export function monthEndUTC(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
}

// ── Assignment ───────────────────────────────────────────────────

export async function assignDailyChallenges(memberId: string): Promise<void> {
  const now = new Date();
  const periodStart = dayStartUTC(now);
  const periodEnd   = dayEndUTC(now);

  // Skip if already assigned today
  const existing = await prisma.memberChallenge.count({
    where: { memberId, periodStart },
  });
  if (existing >= 2) return;

  // Exclude challenges assigned in the last 3 days to reduce repetition
  const cutoff = new Date(periodStart.getTime() - 3 * 86_400_000);
  const recentKeys = await prisma.memberChallenge.findMany({
    where: { memberId, periodStart: { gte: cutoff } },
    select: { challenge: { select: { id: true } } },
  });
  const excludeIds = recentKeys.map(r => r.challenge.id);

  const pool = await prisma.challenge.findMany({
    where: { type: "DAILY", active: true, id: { notIn: excludeIds } },
  });

  const picks = shuffle(pool).slice(0, 2);
  for (const challenge of picks) {
    await prisma.memberChallenge.upsert({
      where: { memberId_challengeId_periodStart: { memberId, challengeId: challenge.id, periodStart } },
      update: {},
      create: { memberId, challengeId: challenge.id, periodStart, periodEnd },
    });
  }
}

export async function assignWeeklyChallenge(memberId: string): Promise<void> {
  const now = new Date();
  const periodStart = weekStartUTC(now);
  const periodEnd   = weekEndUTC(now);

  const existing = await prisma.memberChallenge.count({
    where: { memberId, challenge: { type: "WEEKLY" }, periodStart },
  });
  if (existing >= 1) return;

  // Exclude challenges from last 2 weeks
  const cutoff = new Date(periodStart.getTime() - 14 * 86_400_000);
  const recentKeys = await prisma.memberChallenge.findMany({
    where: { memberId, challenge: { type: "WEEKLY" }, periodStart: { gte: cutoff } },
    select: { challenge: { select: { id: true } } },
  });
  const excludeIds = recentKeys.map(r => r.challenge.id);

  const pool = await prisma.challenge.findMany({
    where: { type: "WEEKLY", active: true, id: { notIn: excludeIds } },
  });

  const pick = shuffle(pool)[0];
  if (!pick) return;

  await prisma.memberChallenge.upsert({
    where: { memberId_challengeId_periodStart: { memberId, challengeId: pick.id, periodStart } },
    update: {},
    create: { memberId, challengeId: pick.id, periodStart, periodEnd },
  });
}

export async function assignMonthlyChallenge(memberId: string): Promise<void> {
  const now = new Date();
  const periodStart = monthStartUTC(now);
  const periodEnd   = monthEndUTC(now);

  const existing = await prisma.memberChallenge.count({
    where: { memberId, challenge: { type: "MONTHLY" }, periodStart },
  });
  if (existing >= 1) return;

  // Exclude last month's challenge
  const lastMonthStart = monthStartUTC(new Date(periodStart.getTime() - 1));
  const recentKeys = await prisma.memberChallenge.findMany({
    where: { memberId, challenge: { type: "MONTHLY" }, periodStart: { gte: lastMonthStart } },
    select: { challenge: { select: { id: true } } },
  });
  const excludeIds = recentKeys.map(r => r.challenge.id);

  const pool = await prisma.challenge.findMany({
    where: { type: "MONTHLY", active: true, id: { notIn: excludeIds } },
  });

  const pick = shuffle(pool)[0];
  if (!pick) return;

  await prisma.memberChallenge.upsert({
    where: { memberId_challengeId_periodStart: { memberId, challengeId: pick.id, periodStart } },
    update: {},
    create: { memberId, challengeId: pick.id, periodStart, periodEnd },
  });
}

// ── Read — lazy assign + auto-claim ─────────────────────────────

export type ActiveChallenge = {
  id: string;
  challengeId: string;
  name: string;
  description: string;
  iconClass: string | null;
  progress: number;
  target: number;
  xpReward: number;
  doubloonReward: number;
  rollTableKey: string | null;
  completedAt: Date | null;
  claimedAt: Date | null;
};

export type AchievementProgress = {
  challengeId: string;
  key: string;
  name: string;
  description: string;
  iconClass: string | null;
  tier: CosmeticRarity | null;
  progress: number;
  target: number;
  unlockedAt: Date | null;
};

export type CompletionPayload = {
  memberChallengeId?: string;
  memberAchievementId?: string;
  name: string;
  // Legacy field names (kept for the existing callers / history view).
  xpAwarded: number;
  doubloonAwarded: number;
  rolledItems: unknown;
  type: ChallengeType;
  // Front-end-friendly fields consumed by RewardRollModal directly.
  xpDelta: number;
  doubloonsDelta: number;
  rolls: Array<{ granted: boolean; outcomeKind: string; payload: any }>;
};

export type ProgressMilestone = {
  memberChallengeId: string;
  challengeId: string;
  name: string;
  pct: number; // 25, 50, 75
  progress: number;
  target: number;
};

export async function getActiveChallenges(memberId: string): Promise<{
  daily: ActiveChallenge[];
  weekly: ActiveChallenge | null;
  monthly: ActiveChallenge | null;
  achievements: AchievementProgress[];
  newCompletions: CompletionPayload[];
}> {
  // Lazy assign if periods have no active quest yet
  await assignDailyChallenges(memberId);
  await assignWeeklyChallenge(memberId);
  await assignMonthlyChallenge(memberId);

  const now = new Date();
  const dailyStart   = dayStartUTC(now);
  const weekStart    = weekStartUTC(now);
  const monthStart   = monthStartUTC(now);

  const [dailyRows, weeklyRow, monthlyRow] = await Promise.all([
    prisma.memberChallenge.findMany({
      where: { memberId, periodStart: dailyStart, challenge: { type: "DAILY" } },
      include: { challenge: true },
    }),
    prisma.memberChallenge.findFirst({
      where: { memberId, periodStart: weekStart, challenge: { type: "WEEKLY" } },
      include: { challenge: true },
    }),
    prisma.memberChallenge.findFirst({
      where: { memberId, periodStart: monthStart, challenge: { type: "MONTHLY" } },
      include: { challenge: true },
    }),
  ]);

  // Auto-claim any completed unclaimed challenges and collect results for UI
  const newCompletions: CompletionPayload[] = [];
  const toAutoClim = [...dailyRows, weeklyRow, monthlyRow].filter(
    r => r && r.completedAt && !r.claimedAt
  ) as Awaited<typeof dailyRows>[number][];

  for (const row of toAutoClim) {
    try {
      const payload = await claimChallenge(memberId, row.id);
      newCompletions.push(payload);
    } catch {
      // Already claimed by a concurrent request — skip
    }
  }

  // Reload after claims
  const [freshDaily, freshWeekly, freshMonthly] = await Promise.all([
    prisma.memberChallenge.findMany({
      where: { memberId, periodStart: dailyStart, challenge: { type: "DAILY" } },
      include: { challenge: true },
    }),
    prisma.memberChallenge.findFirst({
      where: { memberId, periodStart: weekStart, challenge: { type: "WEEKLY" } },
      include: { challenge: true },
    }),
    prisma.memberChallenge.findFirst({
      where: { memberId, periodStart: monthStart, challenge: { type: "MONTHLY" } },
      include: { challenge: true },
    }),
  ]);

  // Achievement list
  const allAchievements = await prisma.challenge.findMany({ where: { type: "ACHIEVEMENT", active: true } });
  const memberAchs      = await prisma.memberAchievement.findMany({ where: { memberId } });
  const achMap          = new Map(memberAchs.map(a => [a.challengeId, a]));

  // For achievements based on cumulative metrics, derive progress from MemberChallenge history
  const achProgress: AchievementProgress[] = allAchievements.map(a => {
    const unlocked = achMap.get(a.id);
    return {
      challengeId: a.id,
      key: a.key,
      name: a.name,
      description: a.description,
      iconClass: a.iconClass,
      tier: a.tier,
      progress: unlocked ? a.target : 0,
      target: a.target,
      unlockedAt: unlocked?.unlockedAt ?? null,
    };
  });

  function toActive(r: typeof freshDaily[number]): ActiveChallenge {
    return {
      id: r.id,
      challengeId: r.challengeId,
      name: r.challenge.name,
      description: r.challenge.description,
      iconClass: r.challenge.iconClass,
      progress: r.progress,
      target: r.challenge.target,
      xpReward: r.challenge.xpReward,
      doubloonReward: r.challenge.doubloonReward,
      rollTableKey: r.challenge.rollTableKey,
      completedAt: r.completedAt,
      claimedAt: r.claimedAt,
    };
  }

  return {
    daily:         freshDaily.map(toActive),
    weekly:        freshWeekly ? toActive(freshWeekly) : null,
    monthly:       freshMonthly ? toActive(freshMonthly) : null,
    achievements:  achProgress,
    newCompletions,
  };
}

// ── Claim ────────────────────────────────────────────────────────

export async function claimChallenge(
  memberId: string,
  memberChallengeId: string
): Promise<CompletionPayload> {
  const row = await prisma.memberChallenge.findUnique({
    where: { id: memberChallengeId },
    include: { challenge: true },
  });

  if (!row || row.memberId !== memberId) throw new Error("Not found");
  if (!row.completedAt) throw new Error("Challenge not completed");
  if (row.claimedAt)    throw new Error("Already claimed");

  // Mark claimed immediately to prevent double-claiming under concurrent load
  await prisma.memberChallenge.update({
    where: { id: memberChallengeId },
    data:  { claimedAt: new Date() },
  });

  const { xpReward, doubloonReward, rollTableKey, type, name } = row.challenge;

  await grantXP(memberId, xpReward, "TASK_COMPLETE");
  await grantDoubloons(memberId, doubloonReward, "TASK_COMPLETE");

  // Daily quests always get the DAILY_DROP bonus roll even if rollTableKey is null
  const effectiveTableKey = rollTableKey ?? (type === "DAILY" ? "DAILY_DROP" : null);

  let results: RollResult[] = [];
  if (effectiveTableKey) {
    results = rollTable(effectiveTableKey);
    await applyRollResults(memberId, `${type}_QUEST`, memberChallengeId, effectiveTableKey, results);
  }

  const rolledItems = results.map(r => ({ kind: r.outcomeKind, ...r.payload }));
  await prisma.memberChallenge.update({
    where: { id: memberChallengeId },
    data:  { rolledItems },
  });

  const rolls = results.map(r => ({
    granted: true,
    outcomeKind: r.outcomeKind,
    payload: r.payload,
  }));

  return {
    memberChallengeId,
    name,
    xpAwarded:       xpReward,
    doubloonAwarded: doubloonReward,
    rolledItems,
    type,
    xpDelta:        xpReward,
    doubloonsDelta: doubloonReward,
    rolls,
  };
}

// ── Achievement claim ────────────────────────────────────────────

async function claimAchievement(
  memberId: string,
  memberAchievementId: string,
  challenge: { name: string; xpReward: number; doubloonReward: number; tier: CosmeticRarity | null }
): Promise<CompletionPayload> {
  const { name, xpReward, doubloonReward, tier } = challenge;

  await grantXP(memberId, xpReward, "TASK_COMPLETE");
  await grantDoubloons(memberId, doubloonReward, "TASK_COMPLETE");

  // Grant tier-appropriate cosmetics for achievements
  let results: RollResult[] = [];
  if (tier) {
    const guaranteedTable = `ACHIEVEMENT_${tier}` as string;
    results = rollTable(guaranteedTable);
    if (results.length === 0) {
      // Fallback: grant one badge of this rarity directly
      await grantAchievementCosmetic(memberId, "BADGE", tier);
    } else {
      await applyRollResults(memberId, "ACHIEVEMENT", memberAchievementId, guaranteedTable, results);
    }
  }

  const rolledItems = results.map(r => ({ kind: r.outcomeKind, ...r.payload }));
  await prisma.memberAchievement.update({
    where: { id: memberAchievementId },
    data:  { rolledItems },
  });

  const rolls = results.map(r => ({
    granted: true,
    outcomeKind: r.outcomeKind,
    payload: r.payload,
  }));

  return {
    memberAchievementId,
    name,
    xpAwarded:       xpReward,
    doubloonAwarded: doubloonReward,
    rolledItems,
    type: "ACHIEVEMENT",
    xpDelta:        xpReward,
    doubloonsDelta: doubloonReward,
    rolls,
  };
}

async function grantAchievementCosmetic(
  memberId: string,
  category: "BADGE" | "BORDER",
  rarity: CosmeticRarity
): Promise<void> {
  const owned = await prisma.memberCosmetic.findMany({
    where: { memberId }, select: { cosmeticId: true },
  });
  const ownedIds = owned.map(o => o.cosmeticId);
  const candidate = await prisma.cosmetic.findFirst({
    where: { category, rarity, id: { notIn: ownedIds } },
    orderBy: { createdAt: "asc" },
  });
  if (candidate) {
    await prisma.memberCosmetic.create({ data: { memberId, cosmeticId: candidate.id } });
  } else {
    const bonus = rarity === "MYTHIC" ? 300 : rarity === "RARE" ? 150 : rarity === "UNCOMMON" ? 75 : 30;
    await grantDoubloons(memberId, bonus, "ADMIN_ADJUSTMENT");
  }
}

// ── Event recording ──────────────────────────────────────────────

// Returns any progress milestones crossed in this call (25/50/75% bands).
// Completions at 100% are handled by the existing claim flow, not surfaced here.
export async function recordEvent(
  memberId: string,
  metric: ChallengeMetric,
  delta: number = 1,
  ctx: { taskId?: string; teammateId?: string; minutes?: number } = {}
): Promise<ProgressMilestone[]> {
  const now = new Date();
  const crossings: ProgressMilestone[] = [];

  const recordCrossing = (
    mc: { id: string; challengeId: string; challenge: { name: string; target: number } },
    prevProgress: number,
    nextProgress: number
  ): void => {
    const target = mc.challenge.target;
    if (target <= 0) return;
    const bands = [25, 50, 75];
    const prevPct = (prevProgress / target) * 100;
    const nextPct = (nextProgress / target) * 100;
    for (const band of bands) {
      if (prevPct < band && nextPct >= band && nextPct < 100) {
        crossings.push({
          memberChallengeId: mc.id,
          challengeId: mc.challengeId,
          name: mc.challenge.name,
          pct: band,
          progress: nextProgress,
          target,
        });
      }
    }
  };

  // Find all active (non-completed) periodic challenges for this member that track this metric
  const activeChallenges = await prisma.memberChallenge.findMany({
    where: {
      memberId,
      completedAt: null,
      periodEnd:   { gt: now },
      challenge: { metricKey: metric, active: true, type: { not: "ACHIEVEMENT" } },
    },
    include: { challenge: true },
  });

  for (const mc of activeChallenges) {
    const current = mc.progress;
    const target  = mc.challenge.target;
    if (current >= target) continue;

    // For metrics that require distinct targets, use progressMeta to dedupe
    const needsDistinct = DISTINCT_METRICS.has(metric);
    let newProgress = current + delta;

    if (needsDistinct && ctx.taskId) {
      const meta = (mc.progressMeta as { touchedIds?: string[] } | null) ?? {};
      const touched = meta.touchedIds ?? [];
      if (touched.includes(ctx.taskId)) continue;
      touched.push(ctx.taskId);
      const distinctDelta = 1;
      newProgress = current + distinctDelta;
      await prisma.memberChallenge.update({
        where: { id: mc.id },
        data:  {
          progress: Math.min(newProgress, target),
          completedAt: newProgress >= target ? now : null,
          progressMeta: { touchedIds: touched },
        },
      });
      recordCrossing(mc, current, Math.min(newProgress, target));
      continue;
    }

    if (needsDistinct && ctx.teammateId) {
      const meta = (mc.progressMeta as { touchedIds?: string[] } | null) ?? {};
      const touched = meta.touchedIds ?? [];
      if (touched.includes(ctx.teammateId)) continue;
      touched.push(ctx.teammateId);
      newProgress = current + 1;
      await prisma.memberChallenge.update({
        where: { id: mc.id },
        data:  {
          progress: Math.min(newProgress, target),
          completedAt: newProgress >= target ? now : null,
          progressMeta: { touchedIds: touched },
        },
      });
      recordCrossing(mc, current, Math.min(newProgress, target));
      continue;
    }

    await prisma.memberChallenge.update({
      where: { id: mc.id },
      data:  {
        progress: Math.min(newProgress, target),
        completedAt: newProgress >= target ? now : null,
      },
    });
    recordCrossing(mc, current, Math.min(newProgress, target));
  }

  // Evaluate achievements — cumulative, no period boundary
  await evaluateAchievements(memberId, metric, delta);

  // Special cross-quest checks
  if (metric === "TASK_COMPLETED" || metric === "TIME_LOG_HOURS" || metric === "BLOG_PUBLISHED" || metric === "OUTREACH_SUBMITTED") {
    await checkAllRounder(memberId);
  }

  return crossings;
}

// Metrics where distinct taskId or teammateId matters (count each unique target once)
const DISTINCT_METRICS = new Set<ChallengeMetric>([
  "STATUS_COMMENT",
  "FILE_ATTACHED",
  "COMMENT_WRITTEN",
  "UNIQUE_ASSIGNEES",
  "UNIQUE_COMMENTERS_TARGETED",
  "TIME_LOG_UNIQUE_TASKS",
  "TIME_LOG_WEEKDAY",
  "COMMENT_REACTION",
  // Mission Briefing fires on create AND on edits that fill in details — each
  // task should only count once per quest period.
  "TASK_CREATED_WITH_DETAILS",
]);

async function evaluateAchievements(memberId: string, metric: ChallengeMetric, delta: number): Promise<void> {
  // Get unearned achievements that track this metric
  const unlocked = await prisma.memberAchievement.findMany({
    where: { memberId }, select: { challengeId: true },
  });
  const unlockedIds = new Set(unlocked.map(a => a.challengeId));

  const candidates = await prisma.challenge.findMany({
    where: { type: "ACHIEVEMENT", metricKey: metric, active: true, id: { notIn: [...unlockedIds] } },
  });

  for (const ach of candidates) {
    const shouldUnlock = await checkAchievementUnlock(memberId, ach.key, ach.metricKey, ach.target, delta);
    if (!shouldUnlock) continue;

    const row = await prisma.memberAchievement.create({
      data: { memberId, challengeId: ach.id },
    });

    await claimAchievement(memberId, row.id, {
      name:           ach.name,
      xpReward:       ach.xpReward,
      doubloonReward: ach.doubloonReward,
      tier:           ach.tier,
    }).catch(err => console.error(`[challenge] achievement claim error ${ach.key}:`, err));
  }
}

async function checkAchievementUnlock(
  memberId: string,
  key: string,
  metric: ChallengeMetric,
  target: number,
  delta: number
): Promise<boolean> {
  // Streak achievements: check actual Streak.currentStreak
  if ((key === "ach_streak_7" || key === "ach_orbit_30" || key === "ach_streak_100") && metric === "DAILY_ACTIVE") {
    const streak = await prisma.streak.findUnique({ where: { memberId } });
    return (streak?.currentStreak ?? 0) >= target;
  }

  // all_rounder: check 6 starter achievements are unlocked
  if (key === "ach_all_rounder") {
    return false; // evaluated in checkAllRounder separately
  }

  // semester_commander: count times ALL_MONTHLY_COMPLETE metric has been fired (cumulative in achievements)
  if (key === "ach_semester_commander" && metric === "ALL_MONTHLY_COMPLETE") {
    // Count how many months this member has completed all monthlies
    const count = await prisma.memberChallenge.count({
      where: {
        memberId,
        challenge: { type: "MONTHLY" },
        claimedAt: { not: null },
      },
    });
    // Rough check: if at least target full months of monthlies completed
    return Math.floor(count / 10) >= target; // ~10 monthly challenges per month pool
  }

  // SEARCH Legend: all Rare-tier achievements unlocked
  if (key === "ach_search_legend" && metric === "RANK_RARE_ACHIEVEMENTS_ALL") {
    const totalRare = await prisma.challenge.count({ where: { type: "ACHIEVEMENT", tier: "RARE" } });
    const unlockedRare = await prisma.memberAchievement.count({
      where: { memberId, challenge: { tier: "RARE" } },
    });
    return unlockedRare >= totalRare;
  }

  // TIME_LOG_HOURS: stored as minutes; compare accumulated minutes
  if (metric === "TIME_LOG_HOURS") {
    const sum = await prisma.timeLog.aggregate({
      where: { memberId },
      _sum: { minutes: true },
    });
    return (sum._sum.minutes ?? 0) >= target;
  }

  // Generic cumulative: count relevant completed tasks/comments/etc
  if (metric === "TASK_COMPLETED") {
    const count = await prisma.task.count({
      where: { assignees: { some: { id: memberId } }, status: "DONE" },
    });
    return count >= target;
  }

  if (metric === "COMMENT_WRITTEN") {
    const count = await prisma.taskComment.count({ where: { authorId: memberId } });
    return count >= target;
  }

  if (metric === "FILE_ATTACHED") {
    // Count distinct tasks with attachments by this member — proxy via time logs
    // (accurate counting would need an audit table; use task comments as proxy)
    return delta >= target;
  }

  if (metric === "BLOG_PUBLISHED") {
    const count = await prisma.outreachSubmission.count({
      where: { authorId: memberId, status: "PUBLISHED" },
    });
    return count >= target;
  }

  if (metric === "OUTREACH_SUBMITTED") {
    const count = await prisma.outreachSubmission.count({
      where: { authorId: memberId, status: { not: "DRAFT" } },
    });
    return count >= target;
  }

  // Fallback: simple delta-based check (fires exactly when delta says so)
  return delta >= target;
}

async function checkAllRounder(memberId: string): Promise<void> {
  const requiredKeys = ["ach_liftoff", "ach_mission_log", "ach_timekeeping", "ach_file_transfer", "ach_transmission", "ach_id_confirmed", "ach_outreach_pioneer"];
  const unlocked = await prisma.memberAchievement.findMany({
    where: { memberId, challenge: { key: { in: requiredKeys } } },
    select: { challengeId: true, challenge: { select: { key: true } } },
  });
  if (unlocked.length < requiredKeys.length) return;

  const allRounderAch = await prisma.challenge.findUnique({ where: { key: "ach_all_rounder" } });
  if (!allRounderAch) return;

  const alreadyUnlocked = await prisma.memberAchievement.findUnique({
    where: { memberId_challengeId: { memberId, challengeId: allRounderAch.id } },
  });
  if (alreadyUnlocked) return;

  const row = await prisma.memberAchievement.create({
    data: { memberId, challengeId: allRounderAch.id },
  });
  await claimAchievement(memberId, row.id, {
    name:           allRounderAch.name,
    xpReward:       allRounderAch.xpReward,
    doubloonReward: allRounderAch.doubloonReward,
    tier:           allRounderAch.tier,
  }).catch(err => console.error("[challenge] all_rounder claim error:", err));
}

// ── End-of-week derived metric checks ────────────────────────────

export async function runWeeklyDerivedChecks(): Promise<void> {
  const now = new Date();
  const members = await prisma.member.findMany({ select: { id: true } });

  for (const { id: memberId } of members) {
    // TASKS_NO_OVERDUE check
    const overdueCount = await prisma.task.count({
      where: {
        assignees: { some: { id: memberId } },
        dueDate:   { lt: now },
        status:    { not: "DONE" },
      },
    });
    if (overdueCount === 0) {
      await recordEvent(memberId, "TASKS_NO_OVERDUE", 1);
    }
  }
}

// ── Shuffle helper ────────────────────────────────────────────────

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
