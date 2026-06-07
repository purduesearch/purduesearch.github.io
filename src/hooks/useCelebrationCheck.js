// On ClubPM page mount, ask the server if there's a pending streak-milestone
// celebration for the current member. The endpoint is one-shot: once consumed,
// it returns null for the rest of the day. Returns the celebration payload (or
// null) and a clear() callback so the host can dismiss the modal.

import { useEffect, useState } from 'react';
import { useClubPmAuth } from '../clubpm/ClubPmAuth';
import { pollCelebration } from '../api/clubPmClient';

export default function useCelebrationCheck() {
  const { member } = useClubPmAuth();
  const [celebration, setCelebration] = useState(null);

  useEffect(() => {
    if (!member?.id) return;
    let cancelled = false;
    pollCelebration().then((data) => {
      if (cancelled) return;
      if (data && data.type === 'streak-milestone') setCelebration(data);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [member?.id]);

  const clear = () => setCelebration(null);

  return { celebration, clearCelebration: clear };
}
