// Detects rank-ups client-side by comparing the current member rank to the
// last rank acknowledged in localStorage. Returns the pending new rank if a
// celebration is needed, plus a dismiss() that records consumption.

import { useEffect, useState } from 'react';
import { useClubPmAuth } from '../clubpm/ClubPmAuth';
import { RANK_ORDER } from '../components/clubpm/celebrate/RankUpModal';

const STORAGE_KEY = 'clubpm-last-seen-rank';

export default function useRankWatcher() {
  const { member } = useClubPmAuth();
  const [pending, setPending] = useState(null);

  useEffect(() => {
    if (!member?.rank) return;
    let stored = null;
    try { stored = localStorage.getItem(STORAGE_KEY); } catch {}
    const seenIdx = stored ? RANK_ORDER.indexOf(stored) : -1;
    const currIdx = RANK_ORDER.indexOf(member.rank);

    if (stored === null) {
      // First load — anchor without celebrating to avoid noise on first login post-deploy.
      try { localStorage.setItem(STORAGE_KEY, member.rank); } catch {}
      return;
    }

    if (currIdx > seenIdx) {
      setPending(member.rank);
    }
  }, [member?.rank]);

  const dismiss = () => {
    if (!pending) return;
    try { localStorage.setItem(STORAGE_KEY, pending); } catch {}
    setPending(null);
  };

  return { pendingRank: pending, dismissRank: dismiss };
}
