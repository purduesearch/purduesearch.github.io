// Listens for `clubpm:achievement-unlocked` (fired by clubPmClient.js when a
// response includes an `achievementUnlocks` array). Each entry queues a
// celebration RewardRollModal so consecutive unlocks present one at a time.

import { useEffect, useState } from 'react';
import RewardRollModal from './challenges/RewardRollModal';

export default function AchievementUnlockListener() {
  const [queue, setQueue] = useState([]);

  useEffect(() => {
    const onUnlock = (e) => {
      const detail = e?.detail;
      if (!detail?.name) return;
      setQueue(q => [...q, detail]);
    };
    window.addEventListener('clubpm:achievement-unlocked', onUnlock);
    return () => window.removeEventListener('clubpm:achievement-unlocked', onUnlock);
  }, []);

  if (queue.length === 0) return null;

  const current = queue[0];
  const handleClose = () => setQueue(q => q.slice(1));

  return (
    <RewardRollModal
      title="Achievement Unlocked!"
      subtitle={current.name}
      xpDelta={Number(current.xpReward ?? 0)}
      doubloonsDelta={Number(current.doubloonReward ?? 0)}
      rolls={[]}
      onClose={handleClose}
    />
  );
}
