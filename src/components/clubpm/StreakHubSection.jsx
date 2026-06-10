import { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { useClubPmAuth } from '../../clubpm/ClubPmAuth';
import { get, getStreak, getActivity, useInventoryItem as consumeInventoryItem, invalidateStreakCache } from '../../api/clubPmClient';
import XpHeatmap from './XpHeatmap';

function formatRelative(date) {
  if (!date) return 'never';
  const d = new Date(date);
  const diffMs = Date.now() - d.getTime();
  const day = 86_400_000;
  if (diffMs < day) return 'today';
  if (diffMs < 2 * day) return 'yesterday';
  return `${Math.floor(diffMs / day)} days ago`;
}

export default function StreakHubSection() {
  const { member } = useClubPmAuth();
  const [streak, setStreak] = useState(null);
  const [activity, setActivity] = useState([]);
  const [xpHistory, setXpHistory] = useState([]);
  const [usingFreeze, setUsingFreeze] = useState(false);

  const loadAll = useCallback(async () => {
    if (!member?.id) return;
    try {
      const [s, act, xp] = await Promise.all([
        getStreak(member.id, { force: true }),
        getActivity(member.id, 365).catch(() => ({ activity: [] })),
        get(`/api/members/${member.id}/xp-history`).catch(() => []),
      ]);
      setStreak(s);
      setActivity(act?.activity ?? []);
      setXpHistory(Array.isArray(xp) ? xp : []);
    } catch {/* ignore */}
  }, [member?.id]);

  useEffect(() => { loadAll(); }, [loadAll]);

  useEffect(() => {
    const onChange = () => loadAll();
    window.addEventListener('clubpm-streak-changed', onChange);
    return () => window.removeEventListener('clubpm-streak-changed', onChange);
  }, [loadAll]);

  const handleUseFreeze = async () => {
    if (usingFreeze || !(streak?.freezesAvailable > 0)) return;
    setUsingFreeze(true);
    try {
      await consumeInventoryItem('STREAK_FREEZE');
      invalidateStreakCache();
      toast.success('Streak Freeze used. Your streak is safe for the next gap day.');
      await loadAll();
    } catch (err) {
      toast.error(err?.message ?? 'Failed to use Streak Freeze.');
    } finally {
      setUsingFreeze(false);
    }
  };

  if (!member?.id) return null;

  const current  = streak?.currentStreak ?? 0;
  const longest  = streak?.longestStreak ?? 0;
  const freezes  = streak?.freezesAvailable ?? 0;
  const daysUntil = streak?.daysUntilMilestone ?? null;
  const lastActive = formatRelative(streak?.lastActivityDate);

  return (
    <section className="pm-streak-hub" aria-label="Streak summary">
      <div className="pm-streak-hub-icon">
        <img
          className="pm-streak-hub-flame"
          src="/clubpm/badges/streak/flame.webp"
          alt=""
          aria-hidden="true"
        />
      </div>

      <div className="pm-streak-hub-main">
        <div className="pm-streak-hub-count">{current}</div>
        <div className="pm-streak-hub-label">Day Streak</div>
        <div className="pm-streak-hub-next">
          {daysUntil ? `${daysUntil} day${daysUntil === 1 ? '' : 's'} to next milestone` : ''}
        </div>
      </div>

      <div className="pm-streak-hub-stats">
        <div className="pm-streak-hub-stat">
          <div className="pm-streak-hub-stat-num">{longest}</div>
          <div className="pm-streak-hub-stat-label">Longest</div>
        </div>
        <div className="pm-streak-hub-stat">
          <div className="pm-streak-hub-stat-num">{freezes}</div>
          <div className="pm-streak-hub-stat-label">Freezes</div>
        </div>
        <div className="pm-streak-hub-stat">
          <div className="pm-streak-hub-stat-num" style={{ fontSize: '0.95rem' }}>{lastActive}</div>
          <div className="pm-streak-hub-stat-label">Last active</div>
        </div>
      </div>

      <div className="pm-streak-hub-actions">
        <button
          type="button"
          className="pm-streak-hub-freeze-btn"
          onClick={handleUseFreeze}
          disabled={freezes === 0 || usingFreeze}
          title={freezes === 0 ? 'No Streak Freezes available' : 'Use a Streak Freeze'}
        >
          <i className="fas fa-snowflake" aria-hidden="true" style={{ marginRight: 6 }} />
          {usingFreeze ? 'Using…' : `Use Freeze (${freezes})`}
        </button>
      </div>

      <div style={{ width: '100%', marginTop: 4 }}>
        <XpHeatmap data={xpHistory} activity={activity} />
      </div>
    </section>
  );
}
