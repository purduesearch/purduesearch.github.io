import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getActiveChallenges, claimChallenge as apiClaimChallenge } from '../../../api/clubPmClient';
import RewardRollModal from './RewardRollModal.jsx';

export default function DailyQuestsWidget() {
  const [quests, setQuests]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [claimingId, setClaimingId] = useState(null);
  const [rollResult, setRollResult] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    getActiveChallenges()
      .then(d => setQuests(d.daily ?? []))
      .catch(() => setQuests([]))
      .finally(() => setLoading(false));
  }, []);

  async function handleClaim(e, mcId) {
    e.stopPropagation();
    if (claimingId) return;
    setClaimingId(mcId);
    try {
      const result = await apiClaimChallenge(mcId);
      setQuests(prev => prev.map(q =>
        q.id === mcId ? { ...q, claimedAt: new Date().toISOString() } : q
      ));
      setRollResult(result);
    } catch {
      // silent
    } finally {
      setClaimingId(null);
    }
  }

  if (loading || quests.length === 0) return null;

  return (
    <>
      <div className="daily-quests-widget">
        <div className="daily-quests-widget-header">
          <div className="daily-quests-widget-title">
            <i className="fas fa-sun" aria-hidden="true" style={{ color: '#ffd600' }} />
            Daily Quests
          </div>
          <Link className="daily-quests-widget-link" to="/clubpm/challenges">
            View All
          </Link>
        </div>

        <div className="daily-quests-list">
          {quests.slice(0, 2).map(mc => {
            const pct = Math.min(100, Math.round((mc.progress / Math.max(mc.target, 1)) * 100));
            const completed = !!mc.completedAt;
            const claimed   = !!mc.claimedAt;

            return (
              <div
                key={mc.id}
                className="daily-quest-row"
                onClick={() => navigate('/clubpm/challenges')}
                role="button"
                tabIndex={0}
                onKeyDown={e => e.key === 'Enter' && navigate('/clubpm/challenges')}
              >
                <div className="daily-quest-row-icon">
                  <i className={mc.iconClass || 'fas fa-star'} aria-hidden="true" />
                </div>
                <div className="daily-quest-row-body">
                  <div className="daily-quest-row-name">{mc.name}</div>
                  <div className="daily-quest-mini-bar-track">
                    <div className="daily-quest-mini-bar-fill" style={{ width: `${pct}%` }} />
                  </div>
                </div>
                {completed && !claimed && (
                  <button
                    className="quest-claim-btn"
                    style={{ fontSize: '0.72rem', padding: '5px 10px' }}
                    disabled={claimingId === mc.id}
                    onClick={e => handleClaim(e, mc.id)}
                  >
                    {claimingId === mc.id ? '…' : 'Claim'}
                  </button>
                )}
                {claimed && (
                  <i
                    className="fas fa-check-circle"
                    aria-hidden="true"
                    style={{ color: 'var(--pm-accent-teal)', fontSize: '1rem', flexShrink: 0 }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {rollResult && (
        <RewardRollModal
          xpDelta={rollResult.xpDelta ?? 0}
          doubloonsDelta={rollResult.doubloonsDelta ?? 0}
          rolls={rollResult.rolls ?? []}
          onClose={() => setRollResult(null)}
        />
      )}
    </>
  );
}
