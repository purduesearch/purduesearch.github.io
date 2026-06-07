import { useEffect, useRef } from 'react';
import ChallengeRewardChips from './ChallengeRewardChips.jsx';

const TIER_MAP = {
  GUARANTEED_MYTHIC:   'mythic',
  MONTHLY_HIGH_RARITY: 'rare',
  WEEKLY_BADGE:        'uncommon',
  DAILY_DROP:          'common',
};
const TIER_LABELS = { mythic: 'Mythic', rare: 'Rare', uncommon: 'Uncommon', common: '' };

function deriveTier(xpReward, rollTableKey) {
  if (rollTableKey && TIER_MAP[rollTableKey]) return TIER_MAP[rollTableKey];
  if (xpReward >= 1000) return 'mythic';
  if (xpReward >= 500)  return 'rare';
  if (xpReward >= 200)  return 'uncommon';
  return 'common';
}

export default function AchievementCard({ achievement, newlyUnlocked }) {
  const { name, description, iconClass, xpReward, doubloonReward, rollTableKey, unlockedAt } = achievement;
  const unlocked = !!unlockedAt;
  const tier = deriveTier(xpReward ?? 0, rollTableKey);
  const cardRef = useRef(null);

  useEffect(() => {
    if (!newlyUnlocked || !cardRef.current || !window.anime) return;
    window.anime({
      targets: cardRef.current,
      scale: [1, 1.08, 1],
      duration: 500,
      easing: 'easeOutBack',
    });
  }, [newlyUnlocked]);

  const tierClass = tier !== 'common' ? ` tier-${tier}` : '';

  return (
    <div
      ref={cardRef}
      className={`achievement-card${tierClass}${unlocked ? ' is-unlocked' : ''}`}
    >
      <div className="achievement-icon-wrap">
        <i className={iconClass || 'fas fa-trophy'} aria-hidden="true" />
      </div>
      {TIER_LABELS[tier] && (
        <span className="achievement-tier-badge">{TIER_LABELS[tier]}</span>
      )}
      <div className="achievement-name">{name}</div>
      <div className="achievement-desc">{description}</div>
      <ChallengeRewardChips xp={xpReward} db={doubloonReward} rollTableKey={rollTableKey} />
      {!unlocked && (
        <div className="achievement-lock-overlay" aria-label="Locked">
          <i className="fas fa-lock" aria-hidden="true" />
        </div>
      )}
    </div>
  );
}
