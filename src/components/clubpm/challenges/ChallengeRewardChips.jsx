const ROLL_TABLE_LABELS = {
  DAILY_DROP:          'Drop chance',
  WEEKLY_BADGE:        'Badge roll',
  MONTHLY_HIGH_RARITY: 'High rarity roll',
  GUARANTEED_MYTHIC:   'Guaranteed Mythic',
};

export default function ChallengeRewardChips({ xp, db, rollTableKey }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
      {xp > 0 && (
        <span className="reward-chip xp-chip">
          <i className="fas fa-star" aria-hidden="true" />
          {xp} XP
        </span>
      )}
      {db > 0 && (
        <span className="reward-chip db-chip">
          <i className="fas fa-coins" aria-hidden="true" />
          {db} DB
        </span>
      )}
      {rollTableKey && (
        <span className="reward-chip roll-chip">
          <i className="fas fa-dice" aria-hidden="true" />
          {ROLL_TABLE_LABELS[rollTableKey] ?? rollTableKey}
        </span>
      )}
    </div>
  );
}
