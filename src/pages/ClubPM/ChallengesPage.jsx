import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useClubPmAuth } from '../../clubpm/ClubPmAuth';
import {
  getActiveChallenges,
  claimChallenge as apiClaimChallenge,
  getAchievements,
} from '../../api/clubPmClient';
import ChallengeCard from '../../components/clubpm/challenges/ChallengeCard.jsx';
import AchievementCard from '../../components/clubpm/challenges/AchievementCard.jsx';
import RewardRollModal from '../../components/clubpm/challenges/RewardRollModal.jsx';
import StreakHubSection from '../../components/clubpm/StreakHubSection.jsx';

// The API returns ActiveChallenge objects that are already flat (no nested
// .challenge sub-object). weekly and monthly are single objects, not arrays.

const TABS = [
  { id: 'today',        label: 'Today',        icon: 'fa-sun' },
  { id: 'week',         label: 'This Week',     icon: 'fa-calendar-week' },
  { id: 'month',        label: 'This Month',    icon: 'fa-calendar-alt' },
  { id: 'achievements', label: 'Achievements',  icon: 'fa-trophy' },
];

const tabVariants = {
  enter:  dir => ({ opacity: 0, x: dir > 0 ? 24 : -24 }),
  center:      { opacity: 1, x: 0 },
  exit:   dir => ({ opacity: 0, x: dir > 0 ? -24 : 24 }),
};

export default function ChallengesPage() {
  const { member } = useClubPmAuth();
  const [tab, setTab] = useState('today');
  const [tabDir, setTabDir] = useState(1);
  const [activeData, setActiveData] = useState({ daily: [], weekly: [], monthly: [] });
  const [achievements, setAchievements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [claimingId, setClaimingId] = useState(null);
  const [rollResult, setRollResult] = useState(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([getActiveChallenges(), getAchievements()])
      .then(([active, ach]) => {
        setActiveData(active ?? {});
        setAchievements(Array.isArray(ach) ? ach : []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleTabChange = useCallback((id) => {
    const cur = TABS.findIndex(t => t.id === tab);
    const nxt = TABS.findIndex(t => t.id === id);
    setTabDir(nxt >= cur ? 1 : -1);
    setTab(id);
  }, [tab]);

  const handleClaim = useCallback(async (mcId) => {
    if (claimingId) return;
    setClaimingId(mcId);
    try {
      const result = await apiClaimChallenge(mcId);
      const stamp = new Date().toISOString();
      const markClaimed = list =>
        list.map(q => q.id === mcId ? { ...q, claimedAt: stamp } : q);
      setActiveData(prev => ({
        ...prev,
        daily:   markClaimed(prev.daily   ?? []),
        weekly:  markClaimed(prev.weekly  ?? []),
        monthly: markClaimed(prev.monthly ?? []),
      }));
      setRollResult(result);
    } catch {
      // silent
    } finally {
      setClaimingId(null);
    }
  }, [claimingId]);

  const daily   = activeData.daily   ?? [];
  // The tour points at a claim button that is actually claimable, not merely
  // the first card — an unclaimable card has no button to spotlight.
  const firstClaimableId = (activeData.daily ?? []).find(mc => mc.completedAt && !mc.claimedAt)?.id ?? null;
  const weekly  = activeData.weekly  ?? [];
  const monthly = activeData.monthly ?? [];

  const xp = member?.xp        ?? member?.totalXp       ?? 0;
  const db = member?.doubloons  ?? member?.totalDoubloons ?? 0;

  return (
    <div className="clubpm-app challenges-page">
      <div className="challenges-page-header">
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <div className="challenges-page-title">
            <i className="fas fa-trophy" aria-hidden="true" style={{ color: '#ffd600' }} />
            Challenges
          </div>
          <span className="challenges-xp-pill">
            <i className="fas fa-star" aria-hidden="true" />
            {Number(xp).toLocaleString()} XP
          </span>
          <span className="challenges-db-pill">
            <i className="fas fa-coins" aria-hidden="true" />
            {Number(db).toLocaleString()} DB
          </span>
        </div>
      </div>

      <StreakHubSection />

      <div className="challenges-tabs">
        {TABS.map(t => (
          <button
            key={t.id}
            className={`challenges-tab-btn${tab === t.id ? ' is-active' : ''}`}
            onClick={() => handleTabChange(t.id)}
          >
            <i className={`fas ${t.icon}`} aria-hidden="true" style={{ marginRight: 5 }} />
            {t.label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait" custom={tabDir}>
        <motion.div
          key={tab}
          custom={tabDir}
          variants={tabVariants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: 0.2, ease: 'easeOut' }}
        >
          {loading ? (
            <div style={{ color: 'var(--pm-text-muted)', textAlign: 'center', padding: '40px 0' }}>
              Loading challenges…
            </div>
          ) : tab === 'today' ? (
            <div className="challenges-list" data-tour-id="challenges.active">
              {daily.length === 0 && (
                <p style={{ color: 'var(--pm-text-muted)', textAlign: 'center', padding: '24px 0' }}>
                  No daily quests yet. Check back tomorrow!
                </p>
              )}
              {daily.map(mc => (
                <ChallengeCard
                  key={mc.id}
                  challenge={mc}
                  claimTourId={mc.id === firstClaimableId ? "challenges.claim" : undefined}
                  onClaim={handleClaim}
                  loading={claimingId === mc.id}
                />
              ))}
            </div>
          ) : tab === 'week' ? (
            <div className="challenges-list">
              {!weekly && (
                <p style={{ color: 'var(--pm-text-muted)', textAlign: 'center', padding: '24px 0' }}>
                  No weekly quest assigned yet.
                </p>
              )}
              {weekly && (
                <ChallengeCard
                  key={weekly.id}
                  challenge={weekly}
                  onClaim={handleClaim}
                  loading={claimingId === weekly.id}
                />
              )}
            </div>
          ) : tab === 'month' ? (
            <div className="challenges-list">
              {!monthly && (
                <p style={{ color: 'var(--pm-text-muted)', textAlign: 'center', padding: '24px 0' }}>
                  No monthly quest assigned yet.
                </p>
              )}
              {monthly && (
                <ChallengeCard
                  key={monthly.id}
                  challenge={monthly}
                  onClaim={handleClaim}
                  loading={claimingId === monthly.id}
                />
              )}
            </div>
          ) : (
            /* Achievements tab */
            <div className="achievements-grid" data-tour-id="challenges.achievements">
              {achievements.length === 0 && (
                <p style={{
                  color: 'var(--pm-text-muted)', textAlign: 'center',
                  padding: '24px 0', gridColumn: '1/-1',
                }}>
                  No achievements yet. Keep contributing!
                </p>
              )}
              {achievements.map(ach => (
                <AchievementCard key={ach.id} achievement={ach} />
              ))}
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {rollResult && (
        <RewardRollModal
          xpDelta={rollResult.xpDelta ?? 0}
          doubloonsDelta={rollResult.doubloonsDelta ?? 0}
          rolls={rollResult.rolls ?? []}
          onClose={() => setRollResult(null)}
        />
      )}
    </div>
  );
}
