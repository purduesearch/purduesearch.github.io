// Streak service — tracks daily activity, extends streaks across consecutive days,
// auto-consumes Streak Freeze inventory items on single-day gaps, and exposes
// the read accessors used by the API + frontend.
//
// All dates are anchored to UTC midnight. The "current day" is whatever UTC day
// `new Date()` falls in. Streak-extension is idempotent per day — multiple
// qualifying actions on the same day extend the streak only on the first action.

import { prisma } from "../db/prisma.js";

const MS_PER_DAY = 86_400_000;

export type ActivitySource =
  | "TASK_COMPLETE"
  | "TASK_ADVANCE"
  | "TIME_LOG"
  | "MILESTONE_COMPLETE"
  | "BLOG_POST_PUBLISHED";

export type ExtendResult = {
  previousStreak: number;
  currentStreak: number;
  longestStreak: number;
  isMilestone: boolean;
  milestoneNumber: number | null;
  freezeConsumed: boolean;
};

/** UTC midnight for the same calendar date as `d`. */
export function startOfUtcDay(d: Date = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Whole-day difference between two UTC-midnight dates. */
function dayDiff(later: Date, earlier: Date): number {
  return Math.round((later.getTime() - earlier.getTime()) / MS_PER_DAY);
}

/** Record a qualifying activity for the member; extends the streak on first action of the day. */
export async function recordActivity(
  memberId: string,
  source: ActivitySource
): Promise<ExtendResult | null> {
  const today = startOfUtcDay();

  // Upsert today's DailyActivity row. If we just created it, this is the first
  // action of the day → we extend the streak. If it already existed, we just
  // bump the action counter and return null (idempotent).
  try {
    const existing = await prisma.dailyActivity.findUnique({
      where: { memberId_date: { memberId, date: today } },
    });

    if (existing) {
      await prisma.dailyActivity.update({
        where: { id: existing.id },
        data:  { actionCount: { increment: 1 } },
      });
      return null; // already counted today — streak unchanged
    }

    await prisma.dailyActivity.create({
      data: { memberId, date: today, actionCount: 1, firstActionAt: new Date() },
    });

    // First action of the day — tick DAILY_ACTIVE challenge metric
    import("./challengeService.js").then(({ recordEvent }) =>
      recordEvent(memberId, "DAILY_ACTIVE", 1)
    ).catch(err => console.error("[challenge] DAILY_ACTIVE:", err));
  } catch (err) {
    // Race-condition tolerant: another concurrent call may have just created the row.
    console.error("[streak] recordActivity dailyActivity upsert:", err);
    void source;
    return null;
  }

  return extendStreak(memberId);
}

/** Pure-ish streak math, called when a member's first action of the day occurs. */
export async function extendStreak(memberId: string): Promise<ExtendResult> {
  const today = startOfUtcDay();
  const existing = await prisma.streak.findUnique({ where: { memberId } });

  const previousStreak = existing?.currentStreak ?? 0;
  const longestPrior   = existing?.longestStreak ?? 0;
  const last           = existing?.lastActivityDate ? startOfUtcDay(existing.lastActivityDate) : null;
  let   currentStreak  = previousStreak;
  let   freezesUsed    = existing?.freezesUsedThisStreak ?? 0;
  let   freezeConsumed = false;

  if (!last) {
    currentStreak = 1;
    freezesUsed   = 0;
  } else {
    const gap = dayDiff(today, last);
    if (gap === 0) {
      // Already extended today — should not normally hit this branch because
      // recordActivity gates on the DailyActivity row, but keep idempotent.
      currentStreak = previousStreak;
    } else if (gap === 1) {
      currentStreak = previousStreak + 1;
    } else if (gap === 2) {
      // Single-day miss → try to consume a Streak Freeze.
      const freeze = await prisma.memberInventory.findUnique({
        where: { memberId_itemKey: { memberId, itemKey: "STREAK_FREEZE" } },
      });
      if (freeze && freeze.quantity > 0) {
        await prisma.memberInventory.update({
          where: { id: freeze.id },
          data:  { quantity: { decrement: 1 } },
        });
        freezeConsumed = true;
        freezesUsed   += 1;
        currentStreak  = previousStreak + 1;
        // Mark the missed day (yesterday) as frozen so the heatmap can show it.
        const frozenDay = new Date(today.getTime() - MS_PER_DAY);
        await prisma.dailyActivity.upsert({
          where:  { memberId_date: { memberId, date: frozenDay } },
          create: { memberId, date: frozenDay, actionCount: 0, wasFrozen: true },
          update: { wasFrozen: true },
        }).catch(err => console.error("[streak] mark frozen day:", err));
      } else {
        currentStreak = 1;
        freezesUsed   = 0;
      }
    } else {
      // Two or more days missed: streak resets regardless of freezes (per plan).
      currentStreak = 1;
      freezesUsed   = 0;
    }
  }

  const longestStreak = Math.max(longestPrior, currentStreak);

  await prisma.streak.upsert({
    where:  { memberId },
    create: {
      memberId,
      currentStreak,
      longestStreak,
      lastActivityDate:      today,
      freezesUsedThisStreak: freezesUsed,
    },
    update: {
      currentStreak,
      longestStreak,
      lastActivityDate:      today,
      freezesUsedThisStreak: freezesUsed,
    },
  });

  const milestoneHit = currentStreak > previousStreak && currentStreak % 10 === 0;

  return {
    previousStreak,
    currentStreak,
    longestStreak,
    isMilestone:     milestoneHit,
    milestoneNumber: milestoneHit ? currentStreak : null,
    freezeConsumed,
  };
}

export async function getMemberStreak(memberId: string): Promise<{
  currentStreak: number;
  longestStreak: number;
  lastActivityDate: Date | null;
  freezesAvailable: number;
  daysUntilMilestone: number;
}> {
  const [streak, freeze] = await Promise.all([
    prisma.streak.findUnique({ where: { memberId } }),
    prisma.memberInventory.findUnique({
      where: { memberId_itemKey: { memberId, itemKey: "STREAK_FREEZE" } },
    }),
  ]);
  const currentStreak    = streak?.currentStreak ?? 0;
  const nextTen          = Math.ceil((currentStreak + 1) / 10) * 10;
  const daysUntilMilestone = Math.max(1, nextTen - currentStreak);

  return {
    currentStreak,
    longestStreak:    streak?.longestStreak ?? 0,
    lastActivityDate: streak?.lastActivityDate ?? null,
    freezesAvailable: freeze?.quantity ?? 0,
    daysUntilMilestone,
  };
}

export async function getActivityHistory(memberId: string, days: number = 30) {
  const since = startOfUtcDay(new Date(Date.now() - days * MS_PER_DAY));
  const rows = await prisma.dailyActivity.findMany({
    where: { memberId, date: { gte: since } },
    orderBy: { date: "asc" },
    select: { date: true, actionCount: true, wasFrozen: true },
  });
  return rows;
}

/**
 * Daily cron entry-point — runs at 02:00 UTC. For every member whose last
 * activity is now more than one full day ago, either consume a freeze or
 * reset their streak. This makes the streak counter reflect "today" even
 * for members who haven't yet logged in for the day.
 */
export async function dailyResetSweep(): Promise<{ scanned: number; frozen: number; reset: number }> {
  const today           = startOfUtcDay();
  const twoDaysAgoStart = new Date(today.getTime() - 2 * MS_PER_DAY);

  // Active streaks (currentStreak > 0) where lastActivityDate is older than yesterday.
  const candidates = await prisma.streak.findMany({
    where: {
      currentStreak: { gt: 0 },
      OR: [
        { lastActivityDate: null },
        { lastActivityDate: { lt: twoDaysAgoStart } },
      ],
    },
    select: { id: true, memberId: true, currentStreak: true, longestStreak: true, lastActivityDate: true, freezesUsedThisStreak: true },
  });

  let frozen = 0;
  let reset  = 0;
  for (const s of candidates) {
    const last = s.lastActivityDate ? startOfUtcDay(s.lastActivityDate) : null;
    const gap  = last ? dayDiff(today, last) : Infinity;

    // gap of exactly 2 (missed yesterday) → try to freeze; else reset.
    if (gap === 2) {
      const freeze = await prisma.memberInventory.findUnique({
        where: { memberId_itemKey: { memberId: s.memberId, itemKey: "STREAK_FREEZE" } },
      });
      if (freeze && freeze.quantity > 0) {
        await prisma.memberInventory.update({
          where: { id: freeze.id },
          data:  { quantity: { decrement: 1 } },
        });
        // Advance lastActivityDate by one day; streak preserved, freezes counter bumped.
        const advanced = new Date(last!.getTime() + MS_PER_DAY);
        await prisma.streak.update({
          where: { id: s.id },
          data:  {
            lastActivityDate:      advanced,
            freezesUsedThisStreak: s.freezesUsedThisStreak + 1,
          },
        });
        // Mark the frozen day so the heatmap reflects it.
        await prisma.dailyActivity.upsert({
          where:  { memberId_date: { memberId: s.memberId, date: advanced } },
          create: { memberId: s.memberId, date: advanced, actionCount: 0, wasFrozen: true },
          update: { wasFrozen: true },
        }).catch(err => console.error("[streak] mark frozen day (sweep):", err));
        frozen += 1;
        continue;
      }
    }

    // Reset
    await prisma.streak.update({
      where: { id: s.id },
      data:  { currentStreak: 0, freezesUsedThisStreak: 0 },
    });
    reset += 1;
  }

  return { scanned: candidates.length, frozen, reset };
}

/**
 * Pending-celebration accessor. Returns a one-shot object the first time a
 * member views any ClubPM page on a day where they hit a multiple-of-10 streak.
 * Subsequent reads on the same day return null. Idempotent.
 *
 * Eligibility: lastActivityDate is today (UTC), currentStreak is a multiple of
 * 10, and celebrationConsumedAt is null OR earlier than the start of today.
 */
export async function consumePendingCelebration(memberId: string): Promise<
  { type: "streak-milestone"; milestone: number; currentStreak: number; longestStreak: number; freezeAwarded: boolean } | null
> {
  const today = startOfUtcDay();
  const [streak, member] = await Promise.all([
    prisma.streak.findUnique({ where: { memberId } }),
    prisma.member.findUnique({ where: { id: memberId }, select: { celebrationConsumedAt: true } }),
  ]);
  if (!streak) return null;
  if (!streak.lastActivityDate) return null;
  if (startOfUtcDay(streak.lastActivityDate).getTime() !== today.getTime()) return null;
  if (streak.currentStreak <= 0 || streak.currentStreak % 10 !== 0) return null;
  if (member?.celebrationConsumedAt && startOfUtcDay(member.celebrationConsumedAt).getTime() >= today.getTime()) {
    return null;
  }

  // Mark consumed.
  await prisma.member.update({
    where: { id: memberId },
    data:  { celebrationConsumedAt: new Date() },
  });

  // Reward: at every multiple of 30, auto-grant one Streak Freeze.
  let freezeAwarded = false;
  if (streak.currentStreak % 30 === 0) {
    await prisma.memberInventory.upsert({
      where:  { memberId_itemKey: { memberId, itemKey: "STREAK_FREEZE" } },
      create: { memberId, itemKey: "STREAK_FREEZE", quantity: 1 },
      update: { quantity: { increment: 1 } },
    });
    freezeAwarded = true;
  }

  return {
    type:           "streak-milestone",
    milestone:      streak.currentStreak,
    currentStreak:  streak.currentStreak,
    longestStreak:  streak.longestStreak,
    freezeAwarded,
  };
}
