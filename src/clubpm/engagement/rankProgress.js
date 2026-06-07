// Rank thresholds + progression helpers. Single source of truth for the
// frontend; mirrors backend/src/services/rewardService.ts RANK_THRESHOLDS.

export const RANK_THRESHOLDS = [
  { rank: "NESTLING",   minXp: 0 },
  { rank: "FLEDGLING",  minXp: 500 },
  { rank: "CADET",      minXp: 1500 },
  { rank: "SPECIALIST", minXp: 3500 },
  { rank: "PIONEER",    minXp: 7000 },
  { rank: "COSMONAUT",  minXp: 12500 },
  { rank: "CELESTIAL",  minXp: 21000 },
];

export function progressToNextRank(xp) {
  const safeXp = Number(xp) || 0;
  const currentIdx = [...RANK_THRESHOLDS].reverse().findIndex(t => safeXp >= t.minXp);
  const realIdx = RANK_THRESHOLDS.length - 1 - currentIdx;
  const current = RANK_THRESHOLDS[realIdx];
  const next = RANK_THRESHOLDS[realIdx + 1];
  if (!next) {
    return { current, next: null, pct: 100, xpIntoCurrent: safeXp - current.minXp, xpToNext: 0 };
  }
  const span = next.minXp - current.minXp;
  const into = safeXp - current.minXp;
  return {
    current,
    next,
    pct: Math.round((into / span) * 100),
    xpIntoCurrent: into,
    xpToNext: next.minXp - safeXp,
  };
}
