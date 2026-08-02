import { useRef } from 'react';
import ChallengeProgressBar from './ChallengeProgressBar.jsx';
import ChallengeRewardChips from './ChallengeRewardChips.jsx';

export default function ChallengeCard({ challenge, onClaim, loading, claimTourId }) {
  const { id, name, description, iconClass, progress, target, xpReward, doubloonReward, rollTableKey, completedAt, claimedAt } = challenge;
  const completed = !!completedAt;
  const claimed   = !!claimedAt;
  const btnRef    = useRef(null);

  function handleClaim() {
    if (!onClaim || loading) return;
    // Press-depth animation
    if (btnRef.current && window.anime) {
      window.anime({
        targets: btnRef.current,
        translateY: [0, 4, 0],
        duration: 300,
        easing: 'easeOutBack',
      });
    }
    onClaim(id);
  }

  return (
    <div
      className="quest-card"
      data-completed={completed ? 'true' : 'false'}
    >
      <div className="quest-icon">
        {iconClass
          ? <i className={iconClass} aria-hidden="true" />
          : <i className="fas fa-star" aria-hidden="true" />
        }
      </div>
      <div className="quest-body">
        <div className="quest-title">{name}</div>
        <div className="quest-desc">{description}</div>
        <ChallengeProgressBar value={progress} target={target} />
        <ChallengeRewardChips xp={xpReward} db={doubloonReward} rollTableKey={rollTableKey} />
      </div>
      {completed && !claimed && (
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <button
            ref={btnRef}
            className="quest-claim-btn"
            data-tour-id={claimTourId}
            onClick={handleClaim}
            disabled={loading}
          >
            {loading ? '…' : 'Claim'}
          </button>
        </div>
      )}
      {claimed && (
        <div style={{ display: 'flex', alignItems: 'center', color: 'var(--pm-accent-teal)', fontSize: '0.8rem', fontWeight: 700 }}>
          <i className="fas fa-check-circle" aria-hidden="true" style={{ marginRight: 4 }} />
          Claimed
        </div>
      )}
    </div>
  );
}
