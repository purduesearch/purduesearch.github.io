// Quests + achievements, merged into the profile. Data lives in the Profile page
// (useQuestData) so the tab badge and the overview teaser can show how many
// quests are ready to claim without mounting this tab.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  claimChallenge as apiClaimChallenge,
  getAchievements,
  getActiveChallenges,
} from "../../../api/clubPmClient";
import ChallengeCard from "../challenges/ChallengeCard.jsx";
import AchievementCard from "../challenges/AchievementCard.jsx";
import RewardRollModal from "../challenges/RewardRollModal.jsx";
import StreakHubSection from "../StreakHubSection.jsx";
import { burstAt } from "../celebrate/confetti";

const asList = (v) => (Array.isArray(v) ? v : v ? [v] : []);
const isClaimable = (q) => !!q.completedAt && !q.claimedAt;

export function useQuestData(enabled, onClaimed) {
  const [active, setActive] = useState({ daily: [], weekly: [], monthly: [] });
  const [achievements, setAchievements] = useState([]);
  const [loading, setLoading] = useState(!!enabled);
  const [claimingId, setClaimingId] = useState(null);
  const [rollResult, setRollResult] = useState(null);

  useEffect(() => {
    if (!enabled) { setLoading(false); return undefined; }
    let live = true;
    Promise.all([getActiveChallenges().catch(() => null), getAchievements().catch(() => [])])
      .then(([a, ach]) => {
        if (!live) return;
        setActive({ daily: asList(a?.daily), weekly: asList(a?.weekly), monthly: asList(a?.monthly) });
        setAchievements(Array.isArray(ach) ? ach : []);
      })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [enabled]);

  const claim = useCallback(async (id) => {
    if (claimingId) return;
    setClaimingId(id);
    try {
      const result = await apiClaimChallenge(id);
      const stamp = new Date().toISOString();
      const mark = (list) => list.map(q => (q.id === id ? { ...q, claimedAt: stamp } : q));
      setActive(prev => ({ daily: mark(prev.daily), weekly: mark(prev.weekly), monthly: mark(prev.monthly) }));
      setRollResult(result);
      const card = document.querySelector(`[data-quest-id="${id}"]`);
      if (card) burstAt(card, { palette: "rankUp", intensity: "normal" });
      onClaimed?.();
    } catch {
      // A failed claim leaves the button available to retry.
    } finally {
      setClaimingId(null);
    }
  }, [claimingId, onClaimed]);

  const claimable = useMemo(
    () => [...active.daily, ...active.weekly, ...active.monthly].filter(isClaimable).length,
    [active],
  );

  return { active, achievements, loading, claimingId, claim, claimable, rollResult, closeRoll: () => setRollResult(null) };
}

function QuestGroup({ title, icon, quests, claimingId, onClaim, firstClaimableId, empty }) {
  const done = quests.filter(q => q.completedAt).length;
  return (
    <section className="cpm-pf-qgroup">
      <header className="cpm-pf-qgroup-head">
        <h3><i className={`fas ${icon}`} aria-hidden="true" /> {title}</h3>
        {quests.length > 0 && <span className="cpm-pf-qgroup-count">{done}/{quests.length} done</span>}
      </header>
      {quests.length === 0 ? (
        <p className="cpm-pf-empty">{empty}</p>
      ) : (
        <div className="challenges-list">
          {quests.map(q => (
            <ChallengeCard
              key={q.id}
              challenge={q}
              claimTourId={q.id === firstClaimableId ? "challenges.claim" : undefined}
              onClaim={onClaim}
              loading={claimingId === q.id}
            />
          ))}
        </div>
      )}
    </section>
  );
}

const ACH_FILTERS = [
  { id: "all", label: "All" },
  { id: "unlocked", label: "Unlocked" },
  { id: "locked", label: "Locked" },
];

export default function QuestsTab({ data }) {
  const { active, achievements, loading, claimingId, claim, rollResult, closeRoll } = data;
  const [filter, setFilter] = useState("all");

  const firstClaimableId = [...active.daily, ...active.weekly, ...active.monthly].find(isClaimable)?.id ?? null;
  const unlocked = achievements.filter(a => a.unlockedAt).length;
  const shown = achievements.filter(a => filter === "all" || (filter === "unlocked" ? a.unlockedAt : !a.unlockedAt));
  const pct = achievements.length ? Math.round((unlocked / achievements.length) * 100) : 0;

  return (
    <>
      <StreakHubSection showHeatmap={false} />

      {loading ? (
        <div className="cpm-pf-empty">Loading quests…</div>
      ) : (
        <>
          <div className="cpm-pf-quests" data-tour-id="challenges.active">
            <QuestGroup title="Today" icon="fa-sun" quests={active.daily} claimingId={claimingId} onClaim={claim}
              firstClaimableId={firstClaimableId} empty="No daily quests yet. Check back tomorrow." />
            <QuestGroup title="This week" icon="fa-calendar-week" quests={active.weekly} claimingId={claimingId} onClaim={claim}
              firstClaimableId={firstClaimableId} empty="No weekly quest assigned yet." />
            <QuestGroup title="This month" icon="fa-calendar-alt" quests={active.monthly} claimingId={claimingId} onClaim={claim}
              firstClaimableId={firstClaimableId} empty="No monthly quest assigned yet." />
          </div>

          <section className="cpm-pf-qgroup cpm-pf-ach">
            <header className="cpm-pf-qgroup-head">
              <h3><i className="fas fa-trophy" aria-hidden="true" /> Achievements</h3>
              <span className="cpm-pf-qgroup-count">{unlocked} of {achievements.length} unlocked</span>
            </header>
            <div className="cpm-pf-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Achievements unlocked">
              <i style={{ width: `${pct}%` }} />
            </div>
            <div className="cpm-pf-seg" role="group" aria-label="Filter achievements">
              {ACH_FILTERS.map(f => (
                <button key={f.id} type="button" className="cpm-pf-pill" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
                  {f.label}
                </button>
              ))}
            </div>
            <div className="achievements-grid" data-tour-id="challenges.achievements">
              {shown.length === 0 && (
                <p className="cpm-pf-empty" style={{ gridColumn: "1 / -1" }}>
                  {achievements.length === 0 ? "No achievements yet. Keep contributing." : "Nothing in this filter."}
                </p>
              )}
              {shown.map(a => <AchievementCard key={a.id} achievement={a} />)}
            </div>
          </section>
        </>
      )}

      {rollResult && (
        <RewardRollModal
          xpDelta={rollResult.xpDelta ?? 0}
          doubloonsDelta={rollResult.doubloonsDelta ?? 0}
          rolls={rollResult.rolls ?? []}
          onClose={closeRoll}
        />
      )}
    </>
  );
}
